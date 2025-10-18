# Eco Sim FHE: A Fully Homomorphic Economic Simulation Game

Eco Sim FHE is an innovative economic simulation game that empowers players to experience the complexities of financial markets while integrating **Zama's Fully Homomorphic Encryption technology**. This unique game allows players to take on the roles of corporate executives and traders, navigating a landscape enriched with encrypted insider information that changes the way they strategize and compete.

## Understanding the Challenge

In today's financial landscape, information asymmetry can significantly impact market performance and individual decision-making. Many players lack access to critical insights, placing them at a disadvantage. Eco Sim FHE addresses this pain point by crafting a game environment where certain crucial market data (like company financial reports) is encrypted and clandestinely shared with select players. This simulation mirrors real-world insider trading scenarios, adding educational value to the gaming experience.

## Zama's FHE Solution

Eco Sim FHE leverages **Zama's Fully Homomorphic Encryption** (FHE) to create a secure environment where sensitive market information can be distributed without compromising privacy. With the implementation of Zama's open-source libraries, such as **Concrete** and **TFHE-rs**, the game intricately simulates an unequal information distribution strategy, allowing players to engage in a rich economic gameplay experience while educating them on the implications of insider trading and market dynamics.

## Key Features

- 🔍 **Encrypted Market Insights**: Critical financial data is shared using FHE technology, providing a unique edge for players with access to this information.
- 🎲 **Asymmetric Gameplay**: Players must adapt their strategies based on the varying levels of information available to them.
- 📈 **Realistic Market Simulation**: Experience the complexities of real financial markets, complete with stock charts and news event flows.
- 🎓 **Educational Value**: Learn about insider trading, market strategies, and economic theory in a gamified setting.

## Technology Stack

- **Programming Languages**: Solidity (for smart contracts), JavaScript (for game logics)
- **Zama's SDK**: Utilizing **zama-fhe**, **Concrete**, and **TFHE-rs** for confidential computations.
- **Frameworks**: Node.js for backend development, Hardhat/Foundry for smart contract management.
- **Environment**: Docker or local machine setup for running simulations.

## Directory Structure

Here’s an overview of the project structure:

```
Eco_Sim_FHE/
│
├── contracts/
│   └── Eco_Sim_FHE.sol
│
├── src/
│   ├── index.js
│   ├── gameLogic.js
│   └── marketData.js
│
├── tests/
│   ├── Eco_Sim_FHE.test.js
│   └── marketLogic.test.js
│
├── package.json
├── hardhat.config.js
└── README.md
```

## Installation Guide

To set up Eco Sim FHE, follow these steps after downloading the project:

1. **Prerequisites**: Ensure you have [Node.js](https://nodejs.org/) installed.
2. **Install Hardhat or Foundry**: Depending on your preference for smart contract development.
3. **Navigate to the project directory**.
4. Run the following command to install the required dependencies, including Zama FHE libraries:
   ```bash
   npm install
   ```

**Note**: Please refrain from using `git clone` or any URL commands to download this project; ensure you've obtained the files manually.

## Build & Run Guide

Once everything is set up, you can compile and run Eco Sim FHE using the following commands:

1. **Compile Contracts**:
   ```bash
   npx hardhat compile
   ```
2. **Run Tests**:
   ```bash
   npx hardhat test
   ```
3. **Deploy to Local Network**:
   ```bash
   npx hardhat run scripts/deploy.js
   ```

Here’s a sample code snippet demonstrating how to simulate a trade using the insider information:

```javascript
const MarketData = require('./marketData');
const { executeTrade } = require('./gameLogic');

async function simulateTrade(playerId, stockId, amount) {
    const insiderInfo = await MarketData.getInsiderInfo(stockId);
    if (insiderInfo) {
        const result = await executeTrade(playerId, stockId, amount, insiderInfo);
        console.log(`Trade executed for Player ${playerId}: ${result}`);
    } else {
        console.log(`No insider information available for stock ${stockId}.`);
    }
}

// Example usage
simulateTrade('player1', 'AAPL', 10);
```

## Acknowledgements

### Powered by Zama

A big thank you to the Zama team for their pioneering work in the realm of Fully Homomorphic Encryption. Their commitment to open-source tools allows developers to create confidential blockchain applications like Eco Sim FHE, providing unprecedented opportunities for learning and engagement in financial literacy.
