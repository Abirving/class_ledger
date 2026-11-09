import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),action=process.argv[2]||'dev';
const flags=action==='start'?['-p',process.env.PORT||'3000']:action==='dev'?['--webpack','-p',process.env.PORT||'3000']:['--webpack'];
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),action,...flags],{stdio:'inherit',env:{...process.env,CLASSLEDGER_TARGET:'postgres'}});child.on('exit',code=>process.exit(code??1));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
