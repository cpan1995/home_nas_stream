import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('.local/cinepro-fixtures',{recursive:true});
const result=spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','30','-c:v','libx264','-preset','ultrafast','-g','48','-pix_fmt','yuv420p','-an','-hls_time','2','-hls_list_size','0','-f','hls','.local/cinepro-fixtures/test.m3u8'],{stdio:'inherit'});
if(result.error) throw result.error;
process.exitCode=result.status??1;
