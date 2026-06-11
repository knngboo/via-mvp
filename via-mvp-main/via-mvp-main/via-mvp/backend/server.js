import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// load environment variables
//
dotenv.config();

// database connection
//
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const PORT = 5000;

// middleware to communicate with frontend
//
const corsOptions = {
    origin: 'http://localhost:5173',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// test route
//
app.get('/', (req, res) => {
    res.send('VIA MVP Backend is running smoothly!');
});

// health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
        res.status(200).json({ status: 'OK', database: dbStatus });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
});

// start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});