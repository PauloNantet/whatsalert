const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getFilePath(table) {
    return path.join(DATA_DIR, `${table}.json`);
}

function readTable(table) {
    const filePath = getFilePath(table);
    if (!fs.existsSync(filePath)) return [];
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return [];
    }
}

function writeTable(table, data) {
    const filePath = getFilePath(table);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

let idCounter = {};
function nextId(table) {
    const data = readTable(table);
    if (data.length === 0) return 1;
    return Math.max(...data.map(d => d.id)) + 1;
}

module.exports = {
    getAll(table) {
        const rows = readTable(table);
        if (table === 'alertas') {
            return rows.map(r => {
                let dias = r.dias;
                if (typeof dias === 'string') {
                    try { dias = JSON.parse(dias); } catch { dias = [0,1,2,3,4,5,6]; }
                }
                return { ...r, dias };
            });
        }
        return rows;
    },

    insert(table, data) {
        const rows = readTable(table);
        const id = nextId(table);
        const newRow = { id, ...data, created_at: new Date().toISOString() };
        rows.push(newRow);
        writeTable(table, rows);
        return id;
    },

    update(table, id, data) {
        const rows = readTable(table);
        const idx = rows.findIndex(r => r.id === parseInt(id));
        if (idx === -1) return false;
        rows[idx] = { ...rows[idx], ...data };
        writeTable(table, rows);
        return true;
    },

    remove(table, id) {
        let rows = readTable(table);
        rows = rows.filter(r => r.id !== parseInt(id));
        writeTable(table, rows);
    },

    clear(table) {
        writeTable(table, []);
    }
};
