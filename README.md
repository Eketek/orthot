# Orthot III
3D Puzzle game with blocks, stairs, ladders, portals, and other complications.

Though presently incomplete, the game is playable here:
https://eketek.github.io/orthot/

This project is intended to be a re-implementation, extension, and Open-Sourcing of Orthot II.  A high level of compatibility is intended - puzzles built with Orthot II are to be loadable and playable in Orthot III (The data format to be retained, though the data from Orthot III editor is not expected to be backwards compatible).  This is also strictly a JavaScript and HTML project.

The previous version is a discontinued commercial project which has since been made available free of charge.  It may be found at this address:
http://orthot.eketech.com/___release.html

# Current version:
#0.3.0 (to be left-shifted to 3.0 after the project is ready for release)

# Project status:
All puzzle mechanics are implemented.  Adding new puzzles still requires the use of the level editor from previous version.  Sound has not been implemneted (also have not decided whether or not to do anything interesting with sound).

# Roadmap (for version 3.0): 
1.  Puzzle editor
Would like to find some existing editor and just write configuration for it and an import function for the game, but since Orthot prefers data in which can encode objects which are positioned & oriented relationally (but does not accept general-purpose scenegraph data), as well as custom properties on anything, it may be necessesary to design a new one.

2.  Sound / music 
TBD.  
