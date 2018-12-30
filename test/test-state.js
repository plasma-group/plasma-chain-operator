/* eslint-env mocha */

const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const constants = require('../src/constants.js')
const accounts = require('./mock-accounts.js').accounts
const web3 = require('../src/eth.js')
const BN = web3.utils.BN
const State = require('../src/state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const encoder = require('plasma-utils').encoder

const expect = chai.expect

chai.use(chaiHttp)

function makeTx (rawTrs, rawSigs) {
  const trs = []
  const sigs = []
  for (let i = 0; i < rawTrs.length; i++) {
    trs.push(new encoder.TR(rawTrs[i]))
    sigs.push(new encoder.Sig(rawSigs[i]))
  }
  const tx = new encoder.Transaction(trs, sigs)
  return tx
}

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
          console.log('Added deposit')
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
      const tx = makeTx([[accounts[0].address, accounts[1].address, 1, 0, 12, 1]], [[0, 0, 0]])
      try {
        await state.addTransaction(tx)
        throw new Error('Expect to fail')
      } catch (err) {}
    })

    it('should return false if the transfer ranges overlap', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add deposits for us to later send
      await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      // Start a new block
      await state.startNewBlock()
      // Create some transfer records & trList
      const tx = makeTx([
        [accounts[0].address, accounts[1].address, ethType, 0, 8, 1],
        [accounts[0].address, accounts[1].address, ethType, 3, 7, 1]
      ], [
        [0, 0, 0], [0, 0, 0]
      ])
      try {
        await state.addTransaction(tx)
        throw new Error('This should have failed!')
      } catch (err) {
      }
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
      const tx = makeTx([
        [accounts[0].address, accounts[1].address, ethType, 0, 12, 1],
        [accounts[1].address, accounts[0].address, ethType, 35, 40, 1]
      ], [
        [0, 0, 0], [0, 0, 0]
      ])
      const result = await state.addTransaction(tx)
      expect(result).to.equal(true)
    })
  })

  describe('getOwnedRanges', () => {
    it('should return the proper number of ranges', async () => {
      // TODO: Actually test the results
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add 100 deposits of value 10 from 100 different accounts
      for (let i = 0; i < 5; i++) {
        await state.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      }
      const ownedRanges = await state.getOwnedRanges(accounts[0].address)
      expect(ownedRanges.length).to.equal(5)
    })
  })
})
