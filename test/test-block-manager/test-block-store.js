/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const log = require('debug')('test:info:test-block-store')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('../../src/block-manager/block-store.js')
const BN = require('web3').utils.BN
const dummyTxs = require('./dummy-tx-utils')
// const constants = require('../../src/constants.js')

const expect = chai.expect

function getTxBundle (txs) {
  const txBundle = []
  for (const tx of txs) {
    txBundle.push([tx, tx.encode()])
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

  it.only('gets range correctly', async () => {
    const TXs = dummyTxs.genNSequentialTransactionsSpacedByOne(100)
    const txBundle = getTxBundle(TXs)
    const blockNumber = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 15])
    blockStore.storeTransactions(blockNumber, txBundle)
    const res = await blockStore.getRanges(blockNumber, new BN(0), new BN(1), new BN(4))
    for (let r of res) { console.log(r) }
  })
})
