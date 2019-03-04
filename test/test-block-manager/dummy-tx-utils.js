const models = require('plasma-utils').serialization.models
const Transaction = models.SignedTransaction
const BN = require('web3').utils.BN

const int32ToHex = (x) => {
  x &= 0xffffffff
  let hex = x.toString(16).toUpperCase()
  return ('0000000000000000' + hex).slice(-16)
}

/**
 * Returns a list of `n` sequential transactions.
 * @param {*} n Number of sequential transactions to return.
 * @return {*} A list of sequential transactions.
 */
const getSequentialTxs = (n, size, blockNumber) => {
  if (blockNumber === undefined) {
    blockNumber = 1
  }
  let txs = []

  for (let i = 0; i < n; i++) {
    txs[i] = new Transaction({
      block: blockNumber,
      transfers: [
        {
          sender: '0x000000000000000f000000000000000000000000', // random fs here because contract crashes on decoding bytes20 of all zeros to address
          recipient: '0x000000000000f000000000000000000000000000',
          token: 0,
          start: i * size,
          end: (i + 1) * size,
        },
      ],
      signatures: [
        {
          v: '1b',
          r: 'd693b532a80fed6392b428604171fb32fdbf953728a3a7ecc7d4062b1652c042',
          s: '24e9c602ac800b983b035700a14b23f78a253ab762deab5dc27e3555a750b354',
        },
      ],
    })
  }

  return txs
}

function genRandomTX(blockNum, senderAddress, recipientAddress, numTransfers) {
  let randomTransfers = []
  for (let i = 0; i < numTransfers; i++) {
    // fuzz a random encoding to test decoding with
    let randomVals = ''
    for (let i = 0; i < 28; i++) {
      // random start, end, type = 12+12+4 bytes
      const randHex = Math.floor(Math.random() * 256)
      randomVals += new BN(randHex, 10).toString(16, 2)
    }
    randomTransfers +=
      senderAddress.slice(2) + recipientAddress.slice(2) + randomVals
    // can't have invalid addresses so ignore this partthe 33rd byte is the numTransfers which isn't random--it's 4
  }
  return (
    new BN(blockNum).toString(16, 8) +
    new BN(numTransfers).toString(16, 2) +
    randomTransfers
  )
}

module.exports = {
  int32ToHex: int32ToHex,
  getSequentialTxs: getSequentialTxs,
  genRandomTX: genRandomTX,
}
