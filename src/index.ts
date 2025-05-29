// src/index.ts (Updated to use the identify controller)
import express, { Express, Request, Response } from 'express';
import { handleIdentifyRequest } from './controllers/identify.controller'; // Import the handler

const app: Express = express();
const port: number = 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// A simple route for the homepage (health check)
app.get('/', (req: Request, res: Response) => {
  res.send('Bitespeed Task Server is running!');
});

// Setup the /identify route to use the imported handler function
app.post('/identify', handleIdentifyRequest);

// Start the server
app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});