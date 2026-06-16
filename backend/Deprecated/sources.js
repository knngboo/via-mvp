import { Router } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import csv from 'csvtojson';

// sources service: uploaded CSVs live in two collections —
// `sources` holds metadata + a small sample, `source_rows` holds every row
// keyed by sourceId so large files never hit the 16MB document limit.
//
const router = Router();
const db = () => mongoose.connection.db;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

const ROW_BATCH = 5000;
const SAMPLE_SIZE = 5;

// upload a csv: multipart form with `file`, plus optional folder/tier fields
//
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded. Send a CSV as the "file" field.' });
        }
        const rows = await csv({ trim: true, ignoreEmpty: true })
            .fromString(req.file.buffer.toString('utf8'));
        if (rows.length === 0) {
            return res.status(400).json({ message: 'CSV contained no data rows.' });
        }

        const columns = Object.keys(rows[0]);
        const sourceDoc = {
            name: req.file.originalname,
            folder: req.body.folder || 'Uncategorized',
            tier: req.body.tier || 'Tier 2: Internal Operational',
            status: 'Ready',
            confidence: 'High',
            size: req.file.size,
            num_rows: rows.length,
            columns,
            sample: rows.slice(0, SAMPLE_SIZE),
            uploaded_at: new Date()
        };
        const { insertedId } = await db().collection('sources').insertOne(sourceDoc);

        for (let i = 0; i < rows.length; i += ROW_BATCH) {
            const chunk = rows.slice(i, i + ROW_BATCH)
                .map((row, j) => ({ sourceId: insertedId, rowIndex: i + j, data: row }));
            await db().collection('source_rows').insertMany(chunk, { ordered: false });
        }
        await db().collection('source_rows').createIndex({ sourceId: 1, rowIndex: 1 });

        res.status(201).json({ ...sourceDoc, _id: insertedId });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// list all sources (metadata only)
//
router.get('/', async (req, res) => {
    try {
        const sources = await db().collection('sources')
            .find({})
            .sort({ uploaded_at: -1 })
            .toArray();
        res.json(sources);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// rows for one source, e.g. /api/sources/:id/rows?limit=200
//
router.get('/:id/rows', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid source id.' });
        }
        const sourceId = new mongoose.Types.ObjectId(req.params.id);
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, 5000);
        const rows = await db().collection('source_rows')
            .find({ sourceId })
            .sort({ rowIndex: 1 })
            .limit(limit)
            .toArray();
        res.json(rows.map(r => r.data));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// delete a source and its rows
//
router.delete('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid source id.' });
        }
        const sourceId = new mongoose.Types.ObjectId(req.params.id);
        const { deletedCount } = await db().collection('sources').deleteOne({ _id: sourceId });
        if (deletedCount === 0) {
            return res.status(404).json({ message: 'Source not found.' });
        }
        await db().collection('source_rows').deleteMany({ sourceId });
        res.json({ deleted: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

export default router;
