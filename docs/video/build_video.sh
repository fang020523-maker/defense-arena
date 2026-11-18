#!/usr/bin/env bash
# ============================================================
# 赛博答辩厅 · 演示视频一键合成（node 辅助算术，无 bc 依赖）
# 输入：s*.webm 素材 + audio/n*.wav 配音
# 输出：演示视频-赛博答辩厅.mp4 (1080p H.264)
# ============================================================
set -e
FF=/d/ffmpeg/ffmpeg.exe
FONT='C\:/Windows/Fonts/msyh.ttc'
cd "$(dirname "$0")"

calc() { node -e "const a=process.argv.slice(1);const f={dur:id=>{const fs=require('fs');return (fs.statSync('audio/n'+id+'.wav').size-44)/44100},max:(x,y)=>Math.max(x,y)};let r=(f[a[0]]);console.log(Number.isFinite(+r)?(+r).toFixed(4):r)" "$1"; }
dur() { node -e "console.log(((require('fs').statSync('audio/n'+process.argv[1]+'.wav').size-44)/44100).toFixed(3))" "$1"; }

NS1=$(dur s1); NS2=$(dur s2); NS3=$(dur s3); NS4=$(dur s4)
NS5A=$(dur s5a); NS5B=$(dur s5b); NS5C=$(dur s5c); NS6=$(dur s6)
echo "配音: s1=$NS1 s2=$NS2 s3=$NS3 s4=$NS4 s5a=$NS5A s5b=$NS5B s5c=$NS5C s6=$NS6"

ENC=(-c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -r 30
     -c:a aac -b:a 128k -ar 44100 -ac 2)

# ---------- 片头卡 ----------
T1=$(node -e "console.log(($NS1+0.8).toFixed(3))")
$FF -y -loglevel error \
  -f lavfi -i "color=c=0x06080F:s=1920x1080:r=30:d=${T1}" -i audio/ns1.wav \
  -filter_complex "\
drawtext=fontfile='${FONT}':text='赛 博 答 辩 厅':fontsize=120:fontcolor=0x22D3EE:x=(w-tw)/2:y=(h-th)/2-110,\
drawtext=fontfile='${FONT}':text='Defense Arena · 多智能体模拟毕业答辩沙盘':fontsize=36:fontcolor=0x8DA2C7:x=(w-tw)/2:y=(h-th)/2+30,\
drawtext=fontfile='${FONT}':text='2026 传智杯全国大学生数智创新与AI应用大赛':fontsize=28:fontcolor=0x8DA2C7:x=(w-tw)/2:y=(h-th)/2+100,\
drawbox=x=660:y=(h)/2+70:w=600:h=2:color=0x1F2C4D@1:t=2[v];[1:a]apad[a]" \
  -map "[v]" -map "[a]" -t "$T1" "${ENC[@]}" parts/01-intro.mp4
echo "01-intro OK (${T1}s)"

# ---------- S2：向导（concat 两段后按配音时长拉伸）----------
$FF -y -loglevel error -i s2a-home.webm -i s2b-config.webm \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 parts/s2-raw.mp4
T2=$(node -e "console.log(($NS2+0.8).toFixed(3))")
ST2=$(node -e "console.log(($T2/28.632).toFixed(4))")
$FF -y -loglevel error -i parts/s2-raw.mp4 -i audio/ns2.wav \
  -filter_complex "[0:v]setpts=${ST2}*PTS[v];[1:a]apad[a]" \
  -map "[v]" -map "[a]" -t "$T2" "${ENC[@]}" parts/02-setup.mp4
echo "02-setup OK (${T2}s x${ST2})"

# ---------- S3：真实答辩 ----------
T3=85.325
$FF -y -loglevel error -i s3-seg1.webm -i audio/ns3.wav \
  -filter_complex "[1:a]adelay=2500|2500,apad[a]" \
  -map 0:v -map "[a]" -t "$T3" "${ENC[@]}" parts/03-defense.mp4
echo "03-defense OK (${T3}s)"

# ---------- S4：报告 ----------
T4=$(node -e "console.log(($NS4+0.8).toFixed(3))")
ST4=$(node -e "console.log(($T4/42.319).toFixed(4))")
$FF -y -loglevel error -i s4-report.webm -i audio/ns4.wav \
  -filter_complex "[0:v]setpts=${ST4}*PTS[v];[1:a]apad[a]" \
  -map "[v]" -map "[a]" -t "$T4" "${ENC[@]}" parts/04-report.mp4
echo "04-report OK (${T4}s x${ST4})"

# ---------- S5a/b/c ----------
$FF -y -loglevel error -i s5a-promptlog.webm -i audio/ns5a.wav \
  -filter_complex "[1:a]apad[a]" -map 0:v -map "[a]" -t 72.318 "${ENC[@]}" parts/05a-promptlog.mp4
$FF -y -loglevel error -i s5b-promptlog2.webm -i audio/ns5b.wav \
  -filter_complex "[1:a]apad[a]" -map 0:v -map "[a]" -t 48.310 "${ENC[@]}" parts/05b-promptlog2.mp4
$FF -y -loglevel error -i s5c-livecoding.webm -i audio/ns5c.wav \
  -filter_complex "[1:a]apad[a]" -map 0:v -map "[a]" -t 45.308 "${ENC[@]}" parts/05c-livecoding.mp4
echo "05a/b/c OK"

# ---------- 片尾卡 ----------
T6=$(node -e "console.log(($NS6+1.0).toFixed(3))")
$FF -y -loglevel error \
  -f lavfi -i "color=c=0x06080F:s=1920x1080:r=30:d=${T6}" -i audio/ns6.wav \
  -filter_complex "\
drawtext=fontfile='${FONT}':text='答辩之前，先来一场赛博答辩':fontsize=64:fontcolor=0x22D3EE:x=(w-tw)/2:y=(h-th)/2-40,\
drawtext=fontfile='${FONT}':text='赛博答辩厅 Defense Arena · Vibe Coding 参赛作品':fontsize=28:fontcolor=0x8DA2C7:x=(w-tw)/2:y=(h-th)/2+70[v];[1:a]apad[a]" \
  -map "[v]" -map "[a]" -t "$T6" "${ENC[@]}" parts/08-outro.mp4
echo "08-outro OK (${T6}s)"

# ---------- 字幕 + 拼接 ----------
node make_subs.mjs > subs.srt
echo "subs.srt OK"

cat > concat.txt <<EOF
file 'parts/01-intro.mp4'
file 'parts/02-setup.mp4'
file 'parts/03-defense.mp4'
file 'parts/04-report.mp4'
file 'parts/05a-promptlog.mp4'
file 'parts/05b-promptlog2.mp4'
file 'parts/05c-livecoding.mp4'
file 'parts/08-outro.mp4'
EOF
$FF -y -loglevel error -f concat -safe 0 -i concat.txt \
  -vf "subtitles=subs.srt:force_style='FontName=Microsoft YaHei,FontSize=20,PrimaryColour=&H00DCE8FF,OutlineColour=&H8006080F,Outline=1,MarginV=28'" \
  -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p \
  -c:a copy "演示视频-赛博答辩厅.mp4"
echo "=========================================="
echo "最终视频已生成"
ls -la 演示视频-赛博答辩厅.mp4
