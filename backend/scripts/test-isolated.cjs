const fs=require('fs'),path=require('path'),cp=require('child_process');
const backend=path.resolve(__dirname,'..'); const dotenv=require('dotenv');
const configFile=path.join(backend,'.env.test.local');
if(!fs.existsSync(configFile))throw Error('Provide ignored backend/.env.test.local for the dedicated test database');
const config=dotenv.parse(fs.readFileSync(configFile));
const db=new URL(config.DATABASE_URL); const direct=new URL(config.DATABASE_URL_UNPOOLED);
if(db.pathname!=='/carelink_hardening_test'||direct.pathname!==db.pathname)throw Error('Tests must use dedicated carelink_hardening_test database');
const app=fs.existsSync(path.join(backend,'.env'))?dotenv.parse(fs.readFileSync(path.join(backend,'.env'))):{};
if(app.DATABASE_URL && new URL(app.DATABASE_URL).pathname===db.pathname && new URL(app.DATABASE_URL).hostname===db.hostname)throw Error('Test database must differ from application database');
const env={...process.env,...config,NODE_ENV:'test',LINE_CHANNEL_SECRET:'isolated-test-line-secret',LINE_CHANNEL_ACCESS_TOKEN:'isolated-test-never-send',LINE_PROVIDER_ID:'live_test_provider',LINE_MESSAGING_CHANNEL_ID:'isolated-test-channel',LINE_MINI_APP_CHANNEL_ID:'2011632269-xjYdlBwl',SESSION_SECRET:'isolated-session-secret-32-characters',MESSAGE_ENCRYPTION_KEY:app.MESSAGE_ENCRYPTION_KEY||'01234567890123456789012345678901',FRONTEND_ORIGIN:'http://localhost:5173',GEMINI_API_KEY:process.env.GEMINI_API_KEY||app.GEMINI_API_KEY||'',GEMINI_MODEL:process.env.GEMINI_MODEL||app.GEMINI_MODEL||'gemini-3.5-flash-lite'};
for(const k of Object.keys(env)){if(/proxy/i.test(k))delete env[k];}
const mode=process.argv[2]||'test';const extra=process.argv.slice(3);
const commands={generate:['node_modules/prisma/build/index.js','generate'],migrate:['node_modules/prisma/build/index.js','migrate','deploy'],status:['node_modules/prisma/build/index.js','migrate','status'],test:['node_modules/jest/bin/jest.js','--runInBand',...extra],build:['node_modules/@nestjs/cli/bin/nest.js','build']};
if(!commands[mode])throw Error('Unknown mode');
console.log('Dedicated DB: carelink_hardening_test; mode='+mode+'; live Gemini configured='+Boolean(env.GEMINI_API_KEY));
const r=cp.spawnSync(process.execPath,commands[mode],{cwd:backend,env,encoding:'utf8',maxBuffer:32*1024*1024});
const secrets=[...Object.entries(app),...Object.entries(config)].filter(([k,v])=>/KEY|SECRET|TOKEN|DATABASE_URL/.test(k)&&v).map(([,v])=>v);
for(let s of [r.stdout||'',r.stderr||'']){for(const v of secrets)s=s.split(v).join('[REDACTED]');process.stdout.write(s);}
if(r.error)console.error(r.error.message);process.exit(r.status===null?1:r.status);
