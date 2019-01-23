/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const log = require('debug')('test:info:test-block-store')
const levelup = require('levelup')
const leveldown = require('leveldown')
const BlockStore = require('../../src/block-manager/block-store.js')
const BN = require('web3').utils.BN
const dummyTxs = require('./dummy-tx-utils')
const EthService = require('../../src/eth-service.js')
const appRoot = require('app-root-path')
const readConfigFile = require('../../src/utils.js').readConfigFile
const path = require('path')
const BLOCKNUMBER_BYTE_SIZE = require('../../src/constants.js').BLOCKNUMBER_BYTE_SIZE
// const constants = require('../../src/constants.js')
const models = require('plasma-utils').serialization.models
const UnsignedTransaction = models.UnsignedTransaction
const TransferProof = models.TransferProof

const expect = chai.expect

function getTxBundle (txs) {
  const txBundle = []
  for (const tx of txs) {
    txBundle.push([tx, Buffer.from(tx.encoded, 'hex')])
  }
  return txBundle
}

function getUnsignedTransaction (tx) {
  const unsignedTx = new UnsignedTransaction({block: tx.block, transfers: tx.transfers})
  return unsignedTx
}

function getHexStringProof (proof) {
  let inclusionProof = []
  for (const sibling of proof) {
    inclusionProof.push(sibling.hash.toString('hex') + sibling.sum.toString('hex', 32))
  }
  return inclusionProof
}

describe.skip('BlockStore', function () {
  let db
  let web3
  let plasmaChain
  let blockStore
  let config

  beforeEach(async () => {
    // Startup with test config file
    const configFile = path.join(appRoot.toString(), 'test', 'config-test.json')
    config = readConfigFile(configFile, 'test')
    // Create dbDir and ethDB dir directory
    if (!fs.existsSync(config.dbDir)) {
      log('Creating a new db directory because it does not exist')
      fs.mkdirSync(config.dbDir)
      fs.mkdirSync(config.ethDBDir)
      fs.mkdirSync(config.txLogDir)
    }
    // Copy a sample tx log to the dbDir
    const TEST_BLOCK_FILENAME = 'test-block-0001.bin'
    fs.copyFileSync(appRoot + '/test/test-block-manager/tx-log/' + TEST_BLOCK_FILENAME, config.txLogDir + '0001')
    // Start up a new chain
    await EthService.startup(config)
    web3 = EthService.web3
    plasmaChain = EthService.plasmaChain
    db = levelup(leveldown(config.blockDBDir))
    blockStore = new BlockStore(db, config.txLogDir)
  })

  it('ingests a block without fail', async () => {
    await blockStore.addBlock('0001')
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
    for (let i = 1; i < 4; i++) {
      const TXs = dummyTxs.getSequentialTxs(100, 1)
      const txBundle = getTxBundle(TXs)
      const blockNumber = new BN(i).toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      blockStore.storeTransactions(blockNumber, txBundle)
      blockStore.blockNumberBN = blockStore.blockNumberBN.add(new BN(1))
    }
    // begin test
    const rangeSinceBlockZero = await blockStore.getTransactions(new BN(1), blockStore.blockNumberBN, new BN(0), new BN(1), new BN(2))
    for (const range of rangeSinceBlockZero) {
      for (const r of range) { log(r) }
    }
  })

  it('generates history proofs correctly', async () => {
    // add some blocks
    const roots = []
    for (let i = 1; i < 4; i++) {
      const TXs = dummyTxs.getSequentialTxs(50, 10, i)
      const txBundle = getTxBundle(TXs)
      const blockNumber = new BN(i).toArrayLike(Buffer, 'big', BLOCKNUMBER_BYTE_SIZE)
      // Store the transactions
      blockStore.storeTransactions(blockNumber, txBundle)
      await Promise.all(blockStore.batchPromises)
      // Generate a new block using these transactions
      const rootHash = await blockStore.sumTree.generateTree(blockNumber)
      blockStore.blockNumberBN = blockStore.blockNumberBN.add(new BN(1))
      // Submit the block to the Plasma Chain contract
      const reciept = await plasmaChain.methods.submitBlock(rootHash).send({gas: 400000})
      expect(reciept.events.SubmitBlockEvent.returnValues['0']).to.equal(blockStore.blockNumberBN.toString())
      expect(reciept.events.SubmitBlockEvent.returnValues['1']).to.equal('0x' + Buffer.from(rootHash).toString('hex'))
      roots.push('0x' + Buffer.from(rootHash).toString('hex'))
    }
    const history = await blockStore.getHistory(new BN(1), new BN(1), new BN(0), new BN(0), new BN(1))
    const trProof = history[0][0]
    trProof.inclusionProof = getHexStringProof(trProof.inclusionProof) // Convert the proof to the format which is technically desired...
    const unsignedTx = getUnsignedTransaction(trProof.transaction)
    await plasmaChain.methods.checkTransferProofAndGetBounds(
      web3.utils.soliditySha3('0x' + unsignedTx.encoded),
      unsignedTx.block.toString(),
      '0x' + new TransferProof(trProof).encoded // txindex only works here if all single-sends
    ).call({gas: 5000000})
    // Expect this call does not cause an ERROR
  })
})
