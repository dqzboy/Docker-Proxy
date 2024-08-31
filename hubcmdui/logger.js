let chalk;
import('chalk').then(module => {
    chalk = module.default;
}).catch(err => {
    console.error('Failed to load chalk:', err);
});

const logger = {
    info: (message) => {
        if (chalk) console.log(chalk.blue(`[INFO] ${message}`));
        else console.log(`[INFO] ${message}`);
    },
    warn: (message) => {
        if (chalk) console.log(chalk.yellow(`[WARN] ${message}`));
        else console.log(`[WARN] ${message}`);
    },
    error: (message) => {
        if (chalk) console.log(chalk.red(`[ERROR] ${message}`));
        else console.log(`[ERROR] ${message}`);
    },
    success: (message) => {
        if (chalk) console.log(chalk.green(`[SUCCESS] ${message}`));
        else console.log(`[SUCCESS] ${message}`);
    }
};

module.exports = logger;