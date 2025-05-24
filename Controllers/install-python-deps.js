const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function installPythonDependencies() {
  console.log('Checking and installing Python dependencies...');
  
  try {
    // First, try to import the modules to see if they're already installed
    const { stdout: testOutput, stderr: testError } = await execAsync('python3 -c "import pandas; import mlxtend; print(\'Dependencies already installed\')"');
    console.log('✓ Python dependencies are already available');
    return true;
  } catch (error) {
    console.log('Python dependencies not found, attempting to install...');
  }

  try {
    // Try installing with --user flag first
    console.log('Installing with --user flag...');
    await execAsync('python3 -m pip install --user pandas mlxtend');
    
    // Test again
    await execAsync('python3 -c "import pandas; import mlxtend; print(\'Installation successful\')"');
    console.log('✓ Python dependencies installed successfully with --user flag');
    return true;
  } catch (error) {
    console.log('--user installation failed, trying global installation...');
  }

  try {
    // Try global installation
    console.log('Installing globally...');
    await execAsync('python3 -m pip install pandas mlxtend');
    
    // Test again
    await execAsync('python3 -c "import pandas; import mlxtend; print(\'Installation successful\')"');
    console.log('✓ Python dependencies installed successfully globally');
    return true;
  } catch (error) {
    console.log('Global installation failed, trying pip3 directly...');
  }

  try {
    // Try with pip3 directly
    console.log('Installing with pip3...');
    await execAsync('pip3 install pandas mlxtend');
    
    // Test again
    await execAsync('python3 -c "import pandas; import mlxtend; print(\'Installation successful\')"');
    console.log('✓ Python dependencies installed successfully with pip3');
    return true;
  } catch (error) {
    console.error('✗ All installation methods failed:', error.message);
    return false;
  }
}

module.exports = { installPythonDependencies };