/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const constants = require('../constants.js')
const accounts = require('./mock-accounts.js').accounts
const web3 = require('../eth.js')
const BN = web3.utils.BN
const State = require('../state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const tSerializer = require('../transaction-serialization.js')

const expect = chai.expect

chai.use(chaiHttp)

describe('State', function () {
  let db
  let state
  const startNewDB = async () => {
    db = levelup(leveldown('./test-db/' + +new Date()))
    // Create a new tx-log dir for this test
    const txLogDirectory = './test-db/' + +new Date() + '-tx-log/'
    fs.mkdirSync(txLogDirectory)
    // Create state object
    state = new State.State(db, txLogDirectory)
    await state.init()
  }
  beforeEach(startNewDB)

  describe('addDeposit', () => {
    it('increments total deposits by the deposit amount', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // There should be no total deposits record
      try {
        await db.get(State.getTotalDepositsKey(ethType))
        // If this succeeded something is going wrong
        throw new Error('Expected no entry for this type')
      } catch (err) {
        if (!err.notFound) throw err
        // Otherwise we (correctly) have no total_deposits record for this type
      }
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      let totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
    })
  })

  describe('startNewBlock', () => {
    it('increments the current blocknumber', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      let totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
      // Increment the blocknumber
      await state.startNewBlock()
      expect(state.blocknumber).to.deep.equal(new BN(1))
    })
    it('should lock deposits while changing blocknumber', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      // Now add a bunch of conflicting deposits. This will trigger a bunch of locks
      for (let i = 0; i < 20; i++) {
        state.addDeposit(addr0, ethType, depositAmount).then((res) => {
          console.log('Added deposit. New total deposits: ', res)
        })
      }
      let totalEthDeposits = await db.get(State.getTotalDepositsKey(ethType))
      console.log('this is our total deposits:' + new BN(totalEthDeposits))
      // Check that our total deposits equal 10
      expect(totalEthDeposits).to.deep.equal(new BN(10).toArrayLike(Buffer, 'big', constants.TYPE_BYTE_SIZE))
      // Increment the blocknumber
      await state.startNewBlock()
      expect(state.blocknumber).to.deep.equal(new BN(1))
    })
  })

  describe('getAffectedRanges', () => {
    it('should be correct', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      // const tokenType = new BN(1)
      const depositAmount = new BN(10)
      // Add a deposit
      await state.addDeposit(addr0, ethType, depositAmount)
      // Now add a bunch of conflicting deposits. This will trigger a bunch of locks
      for (let i = 0; i < 20; i++) {
        await state.addDeposit(addr0, ethType, depositAmount)
      }
      const test = await state.getAffectedRanges(new BN(0), new BN(5), new BN(19))
      console.log(test)
    })
  })

  describe('addTransaction', () => {
    it('should return false if the block already contains a deposit or transfer for the range', async () => {
      // Add deposits for us to later send
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), new BN(0), new BN(10))
      // Create a transfer record which touches the same range which we just deposited
      const tr1 = new tSerializer.SimpleSerializableElement([accounts[0].address, accounts[1].address, 1, 0, 11, 1], tSerializer.schemas.TransferRecord)
      const trList = new tSerializer.SimpleSerializableList([tr1], tSerializer.schemas.TransferRecord)
      const result = await state.addTransaction(trList)
      expect(result).to.equal(false)
    })

    it('should return false if the transfer ranges overlap', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add deposits for us to later send
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      // Start a new block
      await state.startNewBlock()
      // Create some transfer records & trList
      const tr1 = new tSerializer.SimpleSerializableElement([accounts[0].address, accounts[1].address, ethType, 0, 7, 1], tSerializer.schemas.TransferRecord)
      const tr2 = new tSerializer.SimpleSerializableElement([accounts[0].address, accounts[1].address, ethType, 3, 6, 1], tSerializer.schemas.TransferRecord)
      const trList = new tSerializer.SimpleSerializableList([tr1, tr2], tSerializer.schemas.TransferRecord)
      const result = await state.addTransaction(trList)
      expect(result).to.equal(false)
    })

    it('should handle multisends', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add deposits for us to later send
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[1].address)), ethType, depositAmount)
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[1].address)), ethType, depositAmount)
      // Start a new block
      await state.startNewBlock()
      // Create some transfer records & trList
      const tr1 = new tSerializer.SimpleSerializableElement([accounts[0].address, accounts[1].address, ethType, 0, 11, 1], tSerializer.schemas.TransferRecord)
      const tr2 = new tSerializer.SimpleSerializableElement([accounts[1].address, accounts[0].address, ethType, 35, 39, 1], tSerializer.schemas.TransferRecord)
      const trList = new tSerializer.SimpleSerializableList([tr1, tr2], tSerializer.schemas.TransferRecord)
      const result = await state.addTransaction(trList)
      expect(result).to.equal(true)
    })
  })
})
