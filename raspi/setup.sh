#!/usr/bin/env bash
UNAME=$(uname -m)
if [[ $UNAME != arm* ]]
then
    echo "Not running on an ARM CPU. Aborting installation."
    exit 1
fi

# Set current directory to the location of this script to maintain relative file paths.
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )
cd "$parent_path"

echo "Updating system and installing software dependencies."
sudo apt-get update && sudo apt-get upgrade -y && sudo apt-get install -y libasound2-dev libudev-dev sox

if ! [[ "$(command -v npm)" ]]
then
    echo "npm command not found. Installing Node.js"
    if [[ $UNAME == "armv6l" ]]
    then
        wget https://nodejs.org/dist/v10.8.0/node-v10.8.0-linux-armv6l.tar.xz
        tar -xvf node-v10.8.0-linux-armv6l
        cd node-v10.8.0-linux-armv6l
        sudo cp -R * /usr/local/
    else
        curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
else
    echo "npm is already installed. Skipping installation."
fi

echo "Installing PiMidiBox module globally."
sudo npm install -g ..

echo "Installing PiMidiBox systemd service."
sudo cp ./pimidibox.service /etc/systemd/system/pimidibox.service
sudo systemctl start pimidibox
sudo systemctl enable pimidibox