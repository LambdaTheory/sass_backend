import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { internalError, notFound } from './utils/response';

dotenv.config();

const app = express();
const port = process.env.PORT || 3389;
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Import routes
import authRoutes from './routes/auth.routes';
import merchantRoutes from './routes/merchant.routes';
import userRoutes from './routes/user.routes';

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/merchant', merchantRoutes);

app.use('/api/user', userRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  const errorResponse = internalError('Something went wrong!');
  res.status(errorResponse.code).json(errorResponse);
});

// 404 handler
app.use('*', (req, res) => {
  const errorResponse = notFound('Route not found');
  res.status(errorResponse.code).json(errorResponse);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
});

export { app, prisma };