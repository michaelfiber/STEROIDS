"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const PORT = parseInt(process.env.PORT || '8080', 10);
const app = express_1.default();
app.use(express_1.default.static(path_1.default.join(__dirname, '..', 'dist')));
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
});
