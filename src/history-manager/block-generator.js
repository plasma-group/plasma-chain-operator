const log = require('debug')('info:block-generator')

function generateSumTree (transactions) {
  log('Begin merkle sum tree generation')
  // if (!isMainThread) throw new Error('Cannot run init script in worker thread!')
  // // Create our worker
  // log('Begin merkle sum tree generation')
  // const worker = new Worker(__filename, {
  //   workerData: transactions
  // })
  // worker.on('exit', (result) => {
  //   if (result !== 0) {
  //     reject(new Error(`Worker stopped with exit result ${result}`));
  //   }
  // })
}

module.exports = { generateSumTree }
