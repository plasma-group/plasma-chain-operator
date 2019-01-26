/* eslint-env mocha */

const log = require('debug')('test:info:test-state')
const fs = require('fs')
const chai = require('chai')
const chaiHttp = require('chai-http')
const accounts = require('../mock-accounts.js').accounts
const web3 = require('web3')
const BN = web3.utils.BN
const State = require('../../src/state-manager/state.js')
const levelup = require('levelup')
const leveldown = require('leveldown')
const models = require('plasma-utils').serialization.models
const Transfer = models.Transfer
const Signature = models.Signature
const SignedTransaction = models.SignedTransaction
const UnsignedTransaction = models.UnsignedTransaction
const TEST_DB_DIR = require('../../src/constants.js').TEST_DB_DIR

const expect = chai.expect

chai.use(chaiHttp)

const fakeSig = {
  v: '1b',
  r: '0000000000000000000000000000000000000000000000000000000000000000',
  s: '0000000000000000000000000000000000000000000000000000000000000000'
}

let state
let totalDeposits

const operator = {
  addDeposit: (address, tokenType, amount) => {
    const tokenTypeKey = tokenType.toString()
    if (totalDeposits[tokenTypeKey] === undefined) {
      log('Adding new token type to our total deposits store')
      totalDeposits[tokenTypeKey] = new BN(0)
    }
    const start = new BN(totalDeposits[tokenTypeKey])
    totalDeposits[tokenTypeKey] = new BN(totalDeposits[tokenTypeKey].add(amount))
    const end = new BN(totalDeposits[tokenTypeKey])
    return state.addDeposit(address, tokenType, start, end)
  },
  addTransaction: (tx) => {
    return state.addTransaction(tx)
  }
}

function makeTx (rawTrs, rawSigs, block) {
  const trs = []
  const sigs = []
  for (let i = 0; i < rawTrs.length; i++) {
    trs.push(new Transfer(rawTrs[i]))
    sigs.push(new Signature(rawSigs[i]))
  }
  const tx = new SignedTransaction({transfers: trs, signatures: sigs, block: block})
  return tx
}

describe('State', function () {
  let db
  const startNewDB = async () => {
    const dbDir = TEST_DB_DIR
    if (!fs.existsSync(dbDir)) {
      log('Creating a new db directory because it does not exist')
      fs.mkdirSync(dbDir)
    }
    db = levelup(leveldown(dbDir + +new Date()))
    // Create a new tx-log dir for this test
    const txLogDirectory = dbDir + +new Date() + '-tx-log/'
    fs.mkdirSync(txLogDirectory)
    // Create state object
    state = new State(db, txLogDirectory, () => true)
    totalDeposits = {}
    await state.init()
  }
  beforeEach(startNewDB)

  describe('addDeposit', () => {
    it('adds the deposit in the expected location', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const tokenType = new BN(999)
      const depositAmount = new BN(10)
      // Add a deposit
      await operator.addDeposit(addr0, tokenType, depositAmount)
      // Check that our account has a record
      const transactions = await state.getTransactions(accounts[0].address)
      // Get the first record of the set
      const depositTransfer = new UnsignedTransaction(transactions.values().next().value.toString('hex')).transfers[0]
      expect(depositTransfer.token.toString()).to.equal('999')
      expect(depositTransfer.start.toString()).to.equal('0')
      expect(depositTransfer.end.toString()).to.equal('10')
    })
  })

  describe('startNewBlock', () => {
    it('increments the current blockNumber', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add a deposit
      await operator.addDeposit(addr0, ethType, depositAmount)
      // Increment the blockNumber
      await state.startNewBlock()
      expect(state.blockNumber).to.deep.equal(new BN(2))
    })
    it('should lock deposits while changing blockNumber', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add a deposit
      await operator.addDeposit(addr0, ethType, depositAmount)
      // Now add a bunch of conflicting deposits. This will trigger a bunch of locks
      for (let i = 0; i < 20; i++) {
        operator.addDeposit(addr0, ethType, depositAmount).then((res) => {
          log('Added deposit')
        })
      }
      // Increment the blockNumber
      await state.startNewBlock()
      expect(state.blockNumber).to.deep.equal(new BN(2))
    })
  })

  describe('getAffectedRanges', () => {
    it('should be correct', async () => {
      const addr0 = Buffer.from(web3.utils.hexToBytes(accounts[0].address))
      const ethType = new BN(0)
      const depositAmount = new BN(16)
      // Now add a bunch of deposits.
      for (let i = 0; i < 20; i++) {
        await operator.addDeposit(addr0, ethType, depositAmount)
      }
      const test = await state._getAffectedRanges(new BN(0), new BN(0), new BN(50))
      log(test)
    })
  })

  describe('addTransaction', () => {
    it('should return false if the block already contains a transfer for the range', async () => {
      // Add deposits for us to later send
      await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), new BN(0), new BN(10))
      // Create a transfer record which touches the same range which we just deposited
      const tx = makeTx([{sender: accounts[0].address, recipient: accounts[1].address, token: 1, start: 0, end: 12}], [fakeSig], 1)
      try {
        await state.addTransaction(tx)
        throw new Error('Expect to fail')
      } catch (err) {}
    })

    it('should return false if the transfer ranges overlap', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add deposits for us to later send
      await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      // Start a new block
      await state.startNewBlock()
      // Create some transfer records & trList
      const tx = makeTx([
        {sender: accounts[0].address, recipient: accounts[1].address, token: ethType, start: 0, end: 8},
        {sender: accounts[0].address, recipient: accounts[1].address, token: ethType, start: 3, end: 7}
      ], [
        fakeSig, fakeSig
      ], 1)
      try {
        await state.addTransaction(tx)
      } catch (err) {
        return
      }
      throw new Error('This should have failed!')
    })

    it('should handle multisends', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add deposits for us to later send
      await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[1].address)), ethType, depositAmount)
      await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[1].address)), ethType, depositAmount)
      // Create some transfer records & trList
      const tx = makeTx([
        {sender: accounts[0].address, recipient: accounts[1].address, token: ethType, start: 0, end: 12},
        {sender: accounts[1].address, recipient: accounts[0].address, token: ethType, start: 35, end: 40}
      ], [
        fakeSig, fakeSig
      ], 1)
      // Should not throw an error
      const result = await state.addTransaction(tx)
      expect(result).to.not.equal(undefined)
    })
  })

  describe('getOwnedRanges', () => {
    it('should return the proper number of ranges', async () => {
      const ethType = new BN(0)
      const depositAmount = new BN(10)
      // Add 100 deposits of value 10 from 100 different accounts
      for (let i = 0; i < 5; i++) {
        await operator.addDeposit(Buffer.from(web3.utils.hexToBytes(accounts[0].address)), ethType, depositAmount)
      }
      const ownedRanges = await state.getOwnedRanges(accounts[0].address)
      expect(ownedRanges.length).to.equal(5)
    })
  })
})
