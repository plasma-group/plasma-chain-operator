// Constants
const INIT_METHOD = 'init'
const DEPOSIT_METHOD = 'deposit'
const ADD_TX_METHOD = 'addTransaction'
const GET_TXS_METHOD = 'getTransactions'
const GET_HISTORY_PROOF = 'getHistoryProof'
const NEW_BLOCK_METHOD = 'newBlock'
const GET_RECENT_TXS_METHOD = 'getRecentTransactions'
const GET_BLOCK_NUMBER_METHOD = 'getBlockNumber'
const GET_BLOCK_TXS_METHOD = 'getBlockTransactions'
const GET_BLOCK_METADATA_METHOD = 'getBlockMetadata'
const GET_TX_FROM_HASH_METHOD = 'getTxFromHash'
const GET_ETH_INFO_METHOD = 'getEthInfo'
const ADDRESS_BYTE_SIZE = 20
const START_BYTE_SIZE = 12
const TYPE_BYTE_SIZE = 4
const COIN_ID_BYTE_SIZE = START_BYTE_SIZE + TYPE_BYTE_SIZE
const BLOCKNUMBER_BYTE_SIZE = 4
const DEPOSIT_SENDER = '0x0000000000000000000000000000000000000000'
// For now, include a constant which defines the total size of a transaction
const TRANSFER_BYTE_SIZE = ADDRESS_BYTE_SIZE * 2 + TYPE_BYTE_SIZE + START_BYTE_SIZE * 2
const SIGNATURE_BYTE_SIZE = 1 + 32 * 2
// DB Prefixes
//   State Manager
const COIN_ID_PREFIX = Buffer.from([128])
const ADDRESS_PREFIX = Buffer.from([127])
const DEPOSIT_PREFIX = Buffer.from([126])
//   Block Manager
const BLOCK_TX_PREFIX = Buffer.from([255])
const BLOCK_DEPOSIT_PREFIX = Buffer.from([254])
const BLOCK_INDEX_PREFIX = Buffer.from([253])
const BLOCK_ROOT_HASH_PREFIX = Buffer.from([252])
const NUM_LEVELS_PREFIX = Buffer.from([251]) // The number of levels in a particular block
const NODE_DB_PREFIX = Buffer.from([250])
const BLOCK_NUM_TXS_PREFIX = Buffer.from([249])
const BLOCK_TIMESTAMP_PREFIX = Buffer.from([248])
const HASH_TO_TX_PREFIX = Buffer.from([247])
// DB
const ETH_DB_FILENAME = 'eth-config.json'
const TEST_DB_DIR = './operator-db-test/'
const KEYSTORE_DIR = 'operator-keystore'

module.exports = {
  INIT_METHOD,
  DEPOSIT_METHOD,
  NEW_BLOCK_METHOD,
  ADD_TX_METHOD,
  GET_TXS_METHOD,
  GET_BLOCK_NUMBER_METHOD,
  GET_RECENT_TXS_METHOD,
  GET_BLOCK_TXS_METHOD,
  GET_BLOCK_METADATA_METHOD,
  GET_TX_FROM_HASH_METHOD,
  GET_ETH_INFO_METHOD,
  GET_HISTORY_PROOF,
  START_BYTE_SIZE,
  TYPE_BYTE_SIZE,
  COIN_ID_BYTE_SIZE,
  BLOCKNUMBER_BYTE_SIZE,
  TRANSFER_BYTE_SIZE,
  DEPOSIT_SENDER,
  COIN_ID_PREFIX,
  ADDRESS_PREFIX,
  DEPOSIT_PREFIX,
  BLOCK_TX_PREFIX,
  BLOCK_DEPOSIT_PREFIX,
  BLOCK_ROOT_HASH_PREFIX,
  BLOCK_NUM_TXS_PREFIX,
  BLOCK_TIMESTAMP_PREFIX,
  BLOCK_INDEX_PREFIX,
  NUM_LEVELS_PREFIX,
  NODE_DB_PREFIX,
  HASH_TO_TX_PREFIX,
  SIGNATURE_BYTE_SIZE,
  ETH_DB_FILENAME,
  KEYSTORE_DIR,
  TEST_DB_DIR
}
