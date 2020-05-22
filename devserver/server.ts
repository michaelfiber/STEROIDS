import express from 'express';
import path from 'path';

const PORT = parseInt(process.env.PORT || '8080', 10);
const app = express();
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.listen(PORT, () => {
    console.log(`Listening on port ${ PORT }`);
});