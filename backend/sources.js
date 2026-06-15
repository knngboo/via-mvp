import { Router } from 'express';
import multer from 'multer';
import csv from 'csvtojson';

// Accept requireAdmin middleware injected from server.js
export default function (pool, requireAdmin) {
    const router = Router();

    // File upload limits and MIME type validation
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 50 * 1024 * 1024, // 50 MB max
        },
        fileFilter: (req, file, cb) => {
            if (!file.originalname.match(/\.csv$/i)) {
                return cb(new Error('Only .csv files are allowed.'));
            }
            cb(null, true);
        }
    });

    // Ensure the metadata table exists and all context columns are present (idempotent)
    pool.query(`
        CREATE TABLE IF NOT EXISTS bfi.sources_meta (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            table_name VARCHAR(255) UNIQUE NOT NULL,
            status VARCHAR(50) DEFAULT 'Ready',
            size BIGINT,
            num_rows INT,
            columns JSONB,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `)
    .then(() => pool.query(`
        ALTER TABLE bfi.sources_meta
            ADD COLUMN IF NOT EXISTS project_name  VARCHAR(255),
            ADD COLUMN IF NOT EXISTS description   TEXT,
            ADD COLUMN IF NOT EXISTS data_domain   VARCHAR(100),
            ADD COLUMN IF NOT EXISTS coverage_start DATE,
            ADD COLUMN IF NOT EXISTS coverage_end   DATE,
            ADD COLUMN IF NOT EXISTS ongoing        BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS agency_response VARCHAR(50);
    `))
    .catch(err => console.error('Failed to initialise sources_meta table:', err));

    // Upload a CSV — requires admin role (requireAdmin checks JWT on the backend)
    router.post('/', requireAdmin, upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        // Parse the uploaded CSV in memory
        let rows;
        try {
            rows = await csv({ trim: true, ignoreEmpty: true })
                .fromString(req.file.buffer.toString('utf8'));
        } catch (parseErr) {
            return res.status(400).json({ message: `Failed to parse CSV: ${parseErr.message}` });
        }

        if (rows.length === 0) {
            return res.status(400).json({ message: 'CSV contained no data rows.' });
        }

        // C1: Extract tenant from JWT and validate — never interpolate unsanitised schema names into SQL.
        const SAFE_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
        const tenant = SAFE_SCHEMA.test(req.user?.tenant) ? req.user.tenant : 'bfi';

        // M-2: enforce 60-char table name limit to prevent PostgreSQL silent truncation
        //      and identifier collisions (PG max is 63 chars).
        const rawName = req.file.originalname.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const tableName = rawName.slice(0, 60);
        const rawColumns = Object.keys(rows[0]);

        // B4: Sanitize CSV column names — they are untrusted user input and get
        // interpolated into SQL identifiers. Even with quoting, a column name containing
        // a double-quote character can break out of a quoted identifier.
        const sanitizeColumnName = (name, idx) => {
            const cleaned = String(name)
                .replace(/[^a-zA-Z0-9_ ]/g, '')  // strip all non-safe chars (including quotes)
                .trim()
                .replace(/\s+/g, '_')             // normalise spaces to underscores
                .slice(0, 63);                    // PostgreSQL max identifier length
            return cleaned.length > 0 ? cleaned : `col_${idx}`;
        };
        const columns = rawColumns.map(sanitizeColumnName);

        // Use a transaction so the entire upload is atomic —
        // if anything fails, the old table is not dropped and no partial state is left.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // M-1: Acquire a transaction-level advisory lock keyed on the table name.
            // This serialises concurrent uploads of the same filename so the
            // DROP TABLE / CREATE TABLE sequence is never interleaved.
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`bfi.${tableName}`]);

            // 1. Drop existing table if it exists
            await client.query(`DROP TABLE IF EXISTS ${tenant}."${tableName}";`);

            // 2. Build CREATE TABLE query dynamically based on the CSV columns
            const createCols = columns.map(col => `"${col}" TEXT`).join(', ');
            await client.query(`CREATE TABLE ${tenant}."${tableName}" (id SERIAL PRIMARY KEY, ${createCols});`);

            // 3. Bulk insert rows using a single multi-row INSERT per batch (5000 rows/batch)
            // This replaces the old row-by-row approach which caused N round-trips to the DB.
            const BATCH_SIZE = 5000;
            for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
                const batch = rows.slice(offset, offset + BATCH_SIZE);
                const params = [];
                const valuePlaceholders = [];
                let paramIndex = 1;

                for (const row of batch) {
                    const rowPlaceholders = columns.map(() => `$${paramIndex++}`);
                    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
                    columns.forEach(col => params.push(row[col] ?? null));
                }

                const colList = columns.map(c => `"${c}"`).join(', ');
                await client.query(
                    `INSERT INTO ${tenant}."${tableName}" (${colList}) VALUES ${valuePlaceholders.join(', ')};`,
                    params
                );
            }

            // 4. Save metadata to sources_meta — inside the same transaction
            const metaResult = await client.query(`
                INSERT INTO bfi.sources_meta (name, table_name, size, num_rows, columns)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (table_name) DO UPDATE
                    SET name = EXCLUDED.name, size = EXCLUDED.size,
                        num_rows = EXCLUDED.num_rows, columns = EXCLUDED.columns,
                        uploaded_at = CURRENT_TIMESTAMP
                RETURNING id;
            `, [
                req.file.originalname,
                tableName,
                req.file.size,
                rows.length,
                JSON.stringify(columns)
            ]);

            await client.query('COMMIT');

            res.status(201).json({
                message: 'SQL Table created successfully!',
                _id: metaResult.rows[0].id,
                name: req.file.originalname,
                status: 'Ready',
                schema: tenant,
                table: tableName,
                num_rows: rows.length,
                size: req.file.size,
                columns
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Upload Error:', error);
            res.status(500).json({ message: error.message });
        } finally {
            client.release();
        }
    });

    // List all uploaded sources (metadata) — any authenticated user can view
    router.get('/', async (req, res) => {
        const SAFE_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
        const tenant = SAFE_SCHEMA.test(req.user?.tenant) ? req.user.tenant : 'bfi';
        try {
            const result = await pool.query(
                `SELECT * FROM ${tenant}.sources_meta ORDER BY uploaded_at DESC`
            );
            res.json(result.rows);
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    // Delete a source — requires admin role
    router.delete('/:id', requireAdmin, async (req, res) => {
        const SAFE_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
        const tenant = SAFE_SCHEMA.test(req.user?.tenant) ? req.user.tenant : 'bfi';
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) return res.status(400).json({ message: 'Invalid source id.' });

            const metaResult = await pool.query(`SELECT table_name FROM ${tenant}.sources_meta WHERE id = $1`, [id]);
            if (metaResult.rows.length === 0) {
                return res.status(404).json({ message: 'Source not found.' });
            }
            const tableName = metaResult.rows[0].table_name;

            // Drop table and metadata in a transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`DROP TABLE IF EXISTS ${tenant}."${tableName}";`);
                await client.query(`DELETE FROM ${tenant}.sources_meta WHERE id = $1`, [id]);
                await client.query('COMMIT');
                res.json({ deleted: true });
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    });

    // Update submission context metadata (project name, description, dates, AI consent).
    // Called immediately after a successful upload when the Submission Context modal is submitted.
    // Requires admin role (same as upload).
    router.patch('/:id/context', requireAdmin, async (req, res) => {
        const SAFE_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
        const tenant = SAFE_SCHEMA.test(req.user?.tenant) ? req.user.tenant : 'bfi';
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) return res.status(400).json({ message: 'Invalid source id.' });

            const {
                projectName,
                description,
                dataDomain,
                coverageStart,
                coverageEnd,
                ongoing,
                agencyResponse,
            } = req.body;

            // Only update the fields that are safe to store; ignore unknown keys.
            const result = await pool.query(`
                UPDATE ${tenant}.sources_meta
                SET
                    project_name   = $1,
                    description    = $2,
                    data_domain    = $3,
                    coverage_start = $4,
                    coverage_end   = $5,
                    ongoing        = $6,
                    agency_response = $7
                WHERE id = $8
                RETURNING id, name, project_name, description, data_domain,
                          coverage_start, coverage_end, ongoing, agency_response;
            `, [
                projectName   || null,
                description   || null,
                dataDomain    || null,
                coverageStart || null,
                coverageEnd   || null,
                ongoing       === true,
                agencyResponse || null,
                id,
            ]);

            if (result.rows.length === 0) {
                return res.status(404).json({ message: 'Source not found.' });
            }

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Context update error:', error);
            res.status(500).json({ message: error.message });
        }
    });

    return router;
}
