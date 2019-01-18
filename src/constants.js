// Constants
const INIT_METHOD = 'init'
const DEPOSIT_METHOD = 'deposit'
const ADD_TX_METHOD = 'addTransaction'
const NEW_BLOCK_METHOD = 'newBlock'
const ADDRESS_BYTE_SIZE = 20
const START_BYTE_SIZE = 12
const TYPE_BYTE_SIZE = 4
const COIN_ID_BYTE_SIZE = START_BYTE_SIZE + TYPE_BYTE_SIZE
const BLOCKNUMBER_BYTE_SIZE = 4
// For now, include a constant which defines the total size of a transaction
const TRANSFER_BYTE_SIZE = ADDRESS_BYTE_SIZE * 2 + TYPE_BYTE_SIZE + START_BYTE_SIZE * 2 + BLOCKNUMBER_BYTE_SIZE
const SIGNATURE_BYTE_SIZE = 1 + 32 * 2
// DB Prefixes
const BLOCK_TX_PREFIX = Buffer.from([255])
const BLOCK_INDEX_PREFIX = Buffer.from([254])
const NUM_LEVELS_PREFIX = Buffer.from([253]) // The number of levels in a particular block
const NODE_DB_PREFIX = Buffer.from([252])
// DB
const PLASMA_CHAIN_ADDRESS_FILENAME = 'plasma-chain-eth-address.txt'
const TEST_DB_DIR = './db-test/'

module.exports = {
  INIT_METHOD,
  DEPOSIT_METHOD,
  NEW_BLOCK_METHOD,
  ADD_TX_METHOD,
  START_BYTE_SIZE,
  TYPE_BYTE_SIZE,
  COIN_ID_BYTE_SIZE,
  BLOCKNUMBER_BYTE_SIZE,
  TRANSFER_BYTE_SIZE,
  BLOCK_TX_PREFIX,
  BLOCK_INDEX_PREFIX,
  NUM_LEVELS_PREFIX,
  NODE_DB_PREFIX,
  SIGNATURE_BYTE_SIZE,
  PLASMA_CHAIN_ADDRESS_FILENAME,
  TEST_DB_DIR
}
