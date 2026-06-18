const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const backupDB = () => {
    const source = path.join(__dirname, 'tecopos.db');
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    const dest = path.join(backupDir, `backup-${Date.now()}.db`);
    fs.copyFileSync(source, dest);
    console.log(`✅ Backup creado: ${dest}`);
};

// Ejecutar cada 6 horas
cron.schedule('0 */6 * * *', backupDB);

// Ejecutar al iniciar
backupDB();