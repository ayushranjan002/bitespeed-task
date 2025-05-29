// src/index.ts (FINAL VERSION - BEFORE ADDING /identify ROUTE HANDLER)
import express, { Express, Request, Response } from 'express';
// import prisma from './db'; // We won't use prisma directly in index.ts for routing

const app: Express = express();
const port: number = 3000;

// Middleware to parse JSON request bodies
// This is important for your /identify endpoint later
app.use(express.json());

// A simple route for the homepage (health check)
app.get('/', (req: Request, res: Response) => {
  res.send('Bitespeed Task Server is running!');
});

// Placeholder for your /identify route - we will implement this properly soon
// app.post('/identify', (req: Request, res: Response) => {
//   // Logic for /identify will go into a separate controller and service
//   res.status(501).json({ message: 'Identify endpoint not yet implemented.' });
// });

// Start the server
app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});