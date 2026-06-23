// 시작 시 URL을 찍고, SIGTERM 받을 때까지 살아있는 더미 프로세스
console.log('Running on http://127.0.0.1:8888')
setInterval(() => {}, 1000)
process.on('SIGTERM', () => process.exit(0))
