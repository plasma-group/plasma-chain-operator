#!/usr/bin/env node
const program = require('commander')
const colors = require('colors') // eslint-disable-line no-unused-vars
const constants = require('../src/constants.js')
const UnsignedTransaction = require('plasma-utils').serialization.models.UnsignedTransaction
const Web3 = require('web3')
const BN = require('web3').utils.BN
const axios = require('axios')
const accounts = require('../test/mock-accounts.js').accounts
const MockNode = require('../src/mock-node.js')

const timeout = ms => new Promise(resolve => setTimeout(resolve, ms))

// Get the config
const http = axios.create({
  baseURL: 'http://localhost:3000'
})

let idCounter
let totalDeposits = {}

// Operator object wrapper to query api
const operator = {
  addTransaction: async (tx) => {
    const encodedTx = tx.encoded
    let txResponse
    txResponse = await http.post('/api', {
      method: constants.ADD_TX_METHOD,
      jsonrpc: '2.0',
      id: idCounter++,
      params: [
        encodedTx
      ]
    })
    return txResponse.data
  },
  addDeposit: async (recipient, token, amount) => {
    // First calculate start and end from token amount
    const tokenTypeKey = token.toString()
    if (totalDeposits[tokenTypeKey] === undefined) {
      totalDeposits[tokenTypeKey] = new BN(0)
    }
    const start = new BN(totalDeposits[tokenTypeKey])
    totalDeposits[tokenTypeKey] = new BN(totalDeposits[tokenTypeKey].add(amount))
    const end = new BN(totalDeposits[tokenTypeKey])
    let txResponse
    txResponse = await http.post('/api', {
      method: constants.DEPOSIT_METHOD,
      jsonrpc: '2.0',
      id: idCounter++,
      params: {
        recipient: Web3.utils.bytesToHex(recipient),
        token: token.toString(16),
        start: start.toString(16),
        end: end.toString(16)
      }
    })
    return new UnsignedTransaction(txResponse.data.deposit)
  },
  getBlockNumber: async () => {
    const response = await http.post('/api', {
      method: constants.GET_BLOCK_NUMBER_METHOD,
      jsonrpc: '2.0',
      id: idCounter++,
      params: []
    })
    console.log('Sending transactions for block:', new BN(response.data.result, 10).toString(10).green)
    return new BN(response.data.result, 10)
  }
}

program
  .command('*')
  .description('starts a swarm of test nodes for load testing')
  .action(async (none, cmd) => {
    const nodes = []
    for (const acct of accounts) {
      nodes.push(new MockNode(operator, acct, nodes))
    }
    // Add deposits -- it will be a random token above token type 1000 to avoid overlap with real deposits...
    const depositType = new BN(999 + Math.floor(Math.random() * 10000))
    const depositAmount = new BN(10000000, 'hex')
    for (const node of nodes) {
      await node.deposit(depositType, depositAmount)
    }
    const startTime = +new Date()
    // Transact on a looonng loooop!
    for (let i = 0; i < 100000; i++) {
      // Get the current block number
      const blockNumber = await operator.getBlockNumber()
      const promises = []
      for (const node of nodes) {
        promises.push(node.sendRandomTransaction(blockNumber, 2, true))
      }
      await Promise.all(promises)
      console.log('sleeping...')
      await timeout(Math.floor(Math.random() * 1000) + 10)
    }
    console.log('Total time:', +new Date() - startTime)
  })

program.parse(process.argv)
