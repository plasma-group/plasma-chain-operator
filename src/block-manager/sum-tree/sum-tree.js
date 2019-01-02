const web3 = require('web3')
const BN = web3.utils.BN

class MerkleTreeNode {
  constructor (data, sum) {
    this.sum = new BN(sum)
    this.data = data.slice(2) + this.sum.toString(16, 2 * 16) // 2*bytes = num chars in hex
  }
}

class MerkleSumTree {
  constructor (leaves) {
    if (!leaves) {
      this.leaves = []
      this.levels = this.generate([], [[]])
    } else {
      this.leaves = leaves
      let bottom = this.parseLeaves(leaves)
      this.levels = this.generate(bottom, [bottom])
    }
  }

  root () {
    return this.getNode(this.getHeight(), 0)
  }

  getHeight () {
    return this.levels.length - 1
  }

  hash (value) {
    return web3.utils.soliditySha3(value)
  }

  parseLeaves (leaves) {
    return leaves.map((leaf) => {
      return new MerkleTreeNode(this.hash(leaf.data), leaf.sum)
    })
  }

  emptyNode () {
    return new MerkleTreeNode('0x0000000000000000000000000000000000000000000000000000000000000000', 0)
  }

  parent (left, right) {
    return new MerkleTreeNode(this.hash('0x' + left.data + right.data), (left.sum.add(right.sum)))
  }

  getNode (level, index) {
    return this.levels[level][index]
  }

  getLeaf (index) {
    return this.leaves[index]
  }

  generate (children, levels) {
    if (children.length <= 1) {
      return [children]
    }

    let parents = []
    for (let i = 0; i < children.length; i += 2) {
      let left = children[i]
      let right = (i + 1 === children.length) ? this.emptyNode() : children[i + 1]
      let parent = this.parent(left, right)
      parents.push(parent)
    }

    levels.push(parents)
    this.generate(parents, levels)
    return levels
  }
}

module.exports = { MerkleSumTree, MerkleTreeNode }
