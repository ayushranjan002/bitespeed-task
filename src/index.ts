// src/index.ts
import express, { Express, Request, Response } from 'express';

const app: Express = express();
const port: number = 3000; // You can use any port you like

// A simple route for the homepage
app.get('/', (req: Request, res: Response) => {
  res.send('Hello from Bitespeed Task Server!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});