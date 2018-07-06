# PiMidiBox
Turn the Raspberry Pi into a USB MIDI host, configurable MIDI router with added features, and (eventually) more!

Written in Node.js.

## Features
#### Implemented
* **MIDI Routing** - Route MIDI messages from one or more inputs to one or more outputs.
* **Channel Filter** - Specify which MIDI channels to listen for, using either a whitelist or blacklist. Map traffic from one channel to another.
* **Velocity Filter** - Enforce a static or scaled velocity to incoming notes, or drop notes entirely if they do not fall within a specified value range.
* **Chord Filter** - Add additional notes for on-the-fly chords.
#### Planned / In Progress
* **MIDI Clock Master** - Control synchronized playback for one or more output devices.
* **Analog Clock Sync** - Synchronize output devices using an analog-click signal. *(Teenage Engineering Pocket Operators, Korg Volcas)*
* **Configuration Wizard** - Interactive menu-based wizard for updating the software configuration.
* **Config Sync** - Automatic configuration sync & reload to/from USB storage for quick & easy updates from your computer.
* **Sysex file support** - Parse and transmit .sysex files to output devices.
* **MIDI-CC maping** - Map MIDI-CC control messages to controlling software features.

## Compatibility
With the target platform being the Raspberry Pi, this project is being built for and tested on Linux systems.
That being said, I'm aiming for this to be platform-agnostic. This goal may be subject to change.