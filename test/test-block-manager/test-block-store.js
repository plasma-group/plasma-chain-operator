/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const log = require('debug')('test:info:test-block-store')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('../../src/block-manager/block-store.js')
const BN = require('web3').utils.BN
const dummyTxs = require('./dummy-tx-utils')
const BLOCKNUMBER_BYTE_SIZE = require('../../src/constants.js').BLOCKNUMBER_BYTE_SIZE
// const constants = require('../../src/constants.js')

const expect = chai.expect

function getTxBundle (txs) {
  const txBundle = []
  for (const tx of txs) {
    txBundle.push([tx, Buffer.from(tx.encode())])
  }
  return txBundle
}

describe('BlockStore', function () {
  let db
  let blockStore
  beforeEach(async () => {
    const rootDBDir = './db-test/'
    if (!fs.existsSync(rootDBDir)) {
      log('Creating a new db directory because it does not exist')
      fs.mkdirSync(rootDBDir)
    }
    const dbDir = rootDBDir + 'block-db-' + +new Date()
    db = levelup(leveldown(dbDir))
    // Create a new tx-log dir for this test
    const txLogDirectory = './test/test-block-manager/tx-log/'
    // fs.mkdirSync(txLogDirectory)
    // Create state object
    blockStore = new BlockStore(db, txLogDirectory)
  })

  it('ingests a block without fail', async () => {
    await blockStore.addBlock('000000000000')
    // await blockStore.ingestBlock('00000000000000000000000000000002')
    expect(blockStore).to.not.equal(undefined)
  })

  // it('gets range correctly', async () => {
  //   const TXs = dummyTxs.genNSequentialTransactionsSpacedByOne(100)
  //   const txBundle = getTxBundle(TXs)
  //   const blockNumber = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
  //   blockStore.storeTransactions(blockNumber, txBundle)
  //   const res = await blockStore.getTransactionsAt(blockNumber, new BN(0), new BN(1), new BN(4))
  //   // Should print out the ranges 1, 2, 3
  //   for (let r of res) { log(r) }
  //   console.log('')
  // })

  it('gets transaction leaves over a number of blocks correctly', async () => {
    // add some blocks
    for (let i = 0; i < 3; i++) {
      const TXs = dummyTxs.genNSequentialTransactionsSpacedByOne(100)
      const txBundle = getTxBundle(TXs)
      const blockNumber = new BN(i).toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      blockStore.storeTransactions(blockNumber, txBundle)
      blockStore.blockNumberBN = blockStore.blockNumberBN.add(new BN(1))
    }
    // begin test
    const rangeSinceBlockZero = await blockStore.getTransactions(new BN(0), blockStore.blockNumberBN, new BN(0), new BN(1), new BN(2))
    for (const range of rangeSinceBlockZero) {
      for (const r of range) { log(r) }
    }
  })

  it('generates history proofs correctly', async () => {
    // add some blocks
    for (let i = 0; i < 3; i++) {
      const TXs = dummyTxs.genNSequentialTransactionsSpacedByOne(10)
      const txBundle = getTxBundle(TXs)
      const blockNumber = new BN(i).toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      // Store the transactions
      blockStore.storeTransactions(blockNumber, txBundle)
      await Promise.all(blockStore.batchPromises)
      // Generate a new block using these transactions
      await blockStore.sumTree.parseLeaves(blockNumber)
      blockStore.blockNumberBN = blockStore.blockNumberBN.add(new BN(1))
    }
    // // begin test
    // TODO: Write the real test
    // const history = await blockStore.getHistoryAt(new BN(0).toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE), new BN(0), new BN(1), new BN(2))
  })
})
