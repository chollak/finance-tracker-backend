import './config';
import { buildServer } from './framework/express/expressServer';

const app = buildServer();
const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
