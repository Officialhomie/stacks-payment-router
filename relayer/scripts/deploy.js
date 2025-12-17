// Hardhat deployment script for PaymentReceiver.sol
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying PaymentReceiver with account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
  
  const PaymentReceiver = await ethers.getContractFactory("PaymentReceiver");
  const paymentReceiver = await PaymentReceiver.deploy();
  
  await paymentReceiver.waitForDeployment();
  
  const address = await paymentReceiver.getAddress();
  console.log("✅ PaymentReceiver deployed to:", address);
  console.log("");
  console.log("Add to .env:");
  console.log(`SEPOLIA_CONTRACT=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


