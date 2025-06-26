'use client'
import { useState, useEffect } from 'react'
import axios from 'axios'
import { ethers } from 'ethers'

export default function TokenApprovalRevoker() {
  const [address, setAddress] = useState('')
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(false)
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [currentChain, setCurrentChain] = useState(null)

  // Check wallet connection on mount
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' })
          setIsWalletConnected(accounts.length > 0)
          
          const chainId = await window.ethereum.request({ method: 'eth_chainId' })
          setCurrentChain(chainId)
        } catch (error) {
          console.error("Wallet connection check failed:", error)
        }
      }
    }

    checkWalletConnection()

    // Set up event listeners
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        setIsWalletConnected(accounts.length > 0)
      })
      
      window.ethereum.on('chainChanged', (chainId) => {
        setCurrentChain(chainId)
        window.location.reload()
      })
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged')
        window.ethereum.removeListener('chainChanged')
      }
    }
  }, [])

  const connectWallet = async () => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not installed")
      
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      })
      setIsWalletConnected(accounts.length > 0)
      
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      setCurrentChain(chainId)
      
    } catch (error) {
      console.error("Wallet connection failed:", error)
      alert(`Wallet connection failed: ${error.message}`)
    }
  }

  const fetchApprovals = async () => {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      alert("Please enter a valid Ethereum address (0x...)")
      return
    }

    setLoading(true)
    setApprovals([])
    
    try {
      const response = await axios.get(
        `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&page=1&offset=100&apikey=${process.env.NEXT_PUBLIC_ETHERSCAN_KEY}`
      )

      if (response.data.status !== "1") {
        throw new Error(response.data.message || "Etherscan API error")
      }

      // Enhanced approval detection
      const approvalTxs = response.data.result.filter(tx => {
        // Check for approve function signature (0x095ea7b3)
        const isApprovalCall = tx.input?.startsWith('0x095ea7b3')
        
        // Check for approve in function name
        const hasApproveInName = tx.functionName?.toLowerCase().includes('approve')
        
        // Check for approval events (zero address transfers)
        const isApprovalEvent = tx.from === '0x0000000000000000000000000000000000000000'
        
        // Must not be a self-approval
        const isNotSelfApproval = tx.to?.toLowerCase() !== address.toLowerCase()
        
        return (isApprovalCall || hasApproveInName || isApprovalEvent) && isNotSelfApproval
      })

      // Format approvals data
      const formattedApprovals = approvalTxs.map(tx => ({
        tokenSymbol: tx.tokenSymbol || 'Unknown',
        to: tx.to,
        value: tx.value,
        contractAddress: tx.contractAddress,
        txHash: tx.hash,
        timestamp: tx.timeStamp
      }))

      setApprovals(formattedApprovals)

    } catch (error) {
      console.error("Fetch error:", error)
      alert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const revokeApproval = async (approval) => {
    try {
      if (!window.ethereum) throw new Error("MetaMask not installed")
      if (!isWalletConnected) throw new Error("Please connect your wallet first")
      
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const signer = provider.getSigner()
      
      const tokenContract = new ethers.Contract(
        approval.contractAddress,
        [
          'function approve(address spender, uint256 amount) external returns (bool)',
          'function allowance(address owner, address spender) external view returns (uint256)'
        ],
        signer
      )

      // Check current allowance first
      const currentAllowance = await tokenContract.allowance(
        await signer.getAddress(),
        approval.to
      )

      if (currentAllowance.eq(0)) {
        throw new Error("No active approval found")
      }

      // Send revoke transaction
      const tx = await tokenContract.approve(approval.to, 0)
      await tx.wait()
      
      alert(`Success! Approval revoked in transaction: ${tx.hash}`)
      fetchApprovals() // Refresh the list
      
    } catch (error) {
      console.error('Revoke failed:', error)
      alert(`Revoke failed: ${error.message}`)
    }
  }

  return (
    <main className="min-h-screen bg-blue-500 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Token Approval Revoker</h1>
        
        {/* Wallet Connection Status */}
        <div className="mb-6 p-4 bg-white rounded-lg shadow-md ">
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900">
              Wallet Status: {isWalletConnected ? 'Connected' : 'Not Connected'}
            </span>
            {!isWalletConnected && (
              <button
                onClick={connectWallet}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
              >
                Connect Wallet
              </button>
            )}
          </div>
          {currentChain && (
            <p className="text-sm mt-2">
              Network: {currentChain === '0x1' ? 'Ethereum Mainnet' : `Chain ID: ${currentChain}`}
            </p>
          )}
        </div>

        {/* Address Input */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-black"
            />
            <button
              onClick={fetchApprovals}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Check Approvals'}
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center text-gray-900">
            <p>Loading approvals...</p>
          </div>
        ) : approvals.length > 0 ? (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Active Approvals ({approvals.length})</h2>
            </div>
            <ul className="divide-y">
              {approvals.map((approval, index) => (
                <li key={index} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{approval.tokenSymbol}</p>
                      <p className="text-sm text-gray-500">Spender: {approval.to}</p>
                      <p className="text-xs text-gray-400">
                        Contract: {approval.contractAddress?.slice(0, 6)}...{approval.contractAddress?.slice(-4)}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeApproval(approval)}
                      disabled={!isWalletConnected}
                      className={`${
                        !isWalletConnected 
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                          : 'bg-red-100 text-red-600 hover:bg-red-200'
                      } px-3 py-1 rounded-md text-sm font-medium`}
                    >
                      {!isWalletConnected ? 'Connect Wallet' : 'Revoke'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <p className='text-gray-900'>No approvals found for this address</p>
          </div>
        )}
      </div>
    </main>
  )
}