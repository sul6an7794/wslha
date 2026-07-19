process.env.MAFIA_REVEAL_MS = process.env.MAFIA_REVEAL_MS || '15000';
process.env.MAFIA_NIGHT_MS = process.env.MAFIA_NIGHT_MS || '20000';
process.env.MAFIA_DEATH_REVEAL_MS = process.env.MAFIA_DEATH_REVEAL_MS || '5000';
process.env.MAFIA_DAY_MS = process.env.MAFIA_DAY_MS || '15000';
process.env.MAFIA_VOTE_MS = process.env.MAFIA_VOTE_MS || '20000';
process.env.MAFIA_DEFENSE_MS = process.env.MAFIA_DEFENSE_MS || '12000';

require('./server').startServer();
