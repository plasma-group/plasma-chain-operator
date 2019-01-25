/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const log = require('debug')('test:info:test-block-store')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('../../src/block-manager/block-store.js')
const LevelDBSumTree = require('../../src/block-manager/leveldb-sum-tree.js')
const models = require('plasma-utils').serialization.models
const Transfer = models.Transfer
const Signature = models.Signature
const SignedTransaction = models.SignedTransaction
const BN = require('bn.js')
const dummyTxs = require('./dummy-tx-utils')
const TEST_DB_DIR = require('../../src/constants.js').TEST_DB_DIR

const expect = chai.expect

const tr1 = new Transfer({sender: '0x43aaDF3d5b44290385fe4193A1b13f15eF3A4FD5', recipient: '0xa12bcf1159aa01c739269391ae2d0be4037259f3', token: 0, start: 2, end: 3})
const tr2 = new Transfer({sender: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8', recipient: '0xa12bcf1159aa01c739269391ae2d0be4037259f4', token: 0, start: 6, end: 7})
const tr3 = new Transfer({sender: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8', recipient: '0xa12bcf1159aa01c739269391ae2d0be4037259f4', token: 1, start: 100, end: 108})
const sig = new Signature({v: '0a', r: 'd693b532a80fed6392b428604171fb32fdbf953728a3a7ecc7d4062b1652c042', s: 'd693b532a80fed6392b428604171fb32fdbf953728a3a7ecc7d4062b1652c042'})
const TX1 = new SignedTransaction({block: new BN(4), transfers: [tr1], signatures: [sig]})
const TX2 = new SignedTransaction({block: new BN(5), transfers: [tr2], signatures: [sig]})
const TX3 = new SignedTransaction({block: new BN(5), transfers: [tr3], signatures: [sig]})
TX1.TRIndex = TX2.TRIndex = TX3.TRIndex = 0

function getTxBundle (txs) {
  const txBundle = []
  for (const tx of txs) {
    txBundle.push([tx, Buffer.from(tx.encoded, 'hex')])
  }
  return txBundle
}

describe('LevelDBSumTree', function () {
  let db
  let blockStore
  beforeEach(async () => {
    const rootDBDir = TEST_DB_DIR
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

  it('should return 0x0000000 as blockhash if the block is empty', async () => {
    // Ingest the required data to begin processing the block
    const blockNumber = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    // Put a fake entry in the db to find
    await blockStore.db.put(Buffer.from([ 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255 ]), 'this is a fake value')
    // Create a new tree based on block 0's transactions
    const sumTree = new LevelDBSumTree(blockStore.db)
    await sumTree.parseLeaves(blockNumber)
    const root = await sumTree.generateLevel(blockNumber, 0)
    expect(new BN(root).eq(new BN(0))).to.equal(true)
  })

  it('should return 0x0000000 as blockhash even if the entire DB is empty', async () => {
    // Ingest the required data to begin processing the block
    const blockNumber = Buffer.from([0, 0, 0, 0])
    // Create a new tree based on block 0's transactions
    const sumTree = new LevelDBSumTree(blockStore.db)
    await sumTree.parseLeaves(blockNumber)
    const root = await sumTree.generateLevel(blockNumber, 0)
    expect(new BN(root).eq(new BN(0))).to.equal(true)
  })

  it('should generate an odd tree w/ multiple types correctly', async () => {
    // Ingest the required data to begin processing the block
    const TXs = [TX1, TX2, TX3]
    const txBundle = getTxBundle(TXs)
    const blockNumber = Buffer.from([0, 0, 0, 0])
    blockStore.storeTransactions(blockNumber, txBundle)
    await Promise.all(blockStore.batchPromises)
    // Create a new tree based on block 0's transactions
    const sumTree = new LevelDBSumTree(blockStore.db)
    await sumTree.parseLeaves(blockNumber)
    await sumTree.generateLevel(blockNumber, 0)
  })

  it('should succeed in generating a tree of x ordered transactions', async () => {
    const TXs = dummyTxs.getSequentialTxs(1000, 10)
    const txBundle = getTxBundle(TXs)
    const blockNumber = Buffer.from([0, 0, 0, 0])
    blockStore.storeTransactions(blockNumber, txBundle)
    await Promise.all(blockStore.batchPromises)
    // TODO: Optimize this so that we don't spend so long hashing
    const sumTree = new LevelDBSumTree(blockStore.db)
    await sumTree.generateTree(blockNumber)
  })
})
