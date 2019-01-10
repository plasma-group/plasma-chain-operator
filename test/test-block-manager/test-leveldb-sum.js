/* eslint-env mocha */

const fs = require('fs')
// const chai = require('chai')
const log = require('debug')('test:info:test-block-store')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('../../src/block-manager/block-store.js')
const LevelDBSumTree = require('../../src/block-manager/leveldb-sum-tree.js')
const TS = require('plasma-utils').encoder
const DT = require('./dummy-tx-utils')

// const expect = chai.expect

const tr1 = new TS.TR(['0x43aaDF3d5b44290385fe4193A1b13f15eF3A4FD5', '0xa12bcf1159aa01c739269391ae2d0be4037259f3', 0, 2, 3, 4])
const tr2 = new TS.TR(['0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8', '0xa12bcf1159aa01c739269391ae2d0be4037259f4', 0, 6, 7, 5])
const tr3 = new TS.TR(['0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8', '0xa12bcf1159aa01c739269391ae2d0be4037259f4', 1, 100, 108, 5])
const sig = new TS.Sig([0, 56789, 901234])
const TX1 = new TS.Transaction([tr1], [sig])
const TX2 = new TS.Transaction([tr2], [sig])
const TX3 = new TS.Transaction([tr3], [sig])
TX1.TRIndex = TX2.TRIndex = TX3.TRIndex = 0

function getTxBundle (txs) {
  const txBundle = []
  for (const tx of txs) {
    txBundle.push([tx, tx.encode()])
  }
  return txBundle
}

describe('LevelDBSumTree', function () {
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

  it('should generate an odd tree w/ multiple types correctly', async () => {
    // Ingest the required data to begin processing the block
    const TXs = [TX1, TX2, TX3]
    const txBundle = getTxBundle(TXs)
    const blockNumber = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    blockStore.storeTransactions(blockNumber, txBundle)
    await Promise.all(blockStore.batchPromises)
    // Create a new tree based on block 0's transactions
    const sumTree = new LevelDBSumTree(blockStore.db)
    await sumTree.parseLeaves(blockNumber)
    await sumTree.generateLevel(blockNumber, 0)
  })

  it('should succeed in generating a tree of 100 ordered transactions', async () => {
    const TXs = DT.genNSequentialTransactions(10000)
    const txBundle = getTxBundle(TXs)
    const blockNumber = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    blockStore.storeTransactions(blockNumber, txBundle)
    await Promise.all(blockStore.batchPromises)
    // TODO: Optimize this so that we don't spend so long hashing
    const sumTree = new LevelDBSumTree(blockStore.db)
    await sumTree.parseLeaves(blockNumber)
  })
})
