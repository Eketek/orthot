/*

Creatures wander around under their own volition and will defeat Player on contact.  

Mouse
A mouse moves forward along the edges and/or walls to its right.  If it doesn't have an edge or wall to follow, it moves forward until it finds one.  Mice 
defeat the player on contact and make no effort to avoid.

Moose
Moose are just like mice, except they follow edges and walls to the left

Robot
Robots turn every time they reach an obstruction or edge.  

Ball
Balls move and bounce back and forth horizontally between obstructions.  They will fall off ledges if they encounter them.  Balls push wall-attached buttons.  
They also defeat Player.

Little Dog
Little Dog chases and defeats Player.

Big Dog
Like the smaller variety, except larger, somewhat more obvious, and will also jump off ledges to get at Player.

Kitten
Kitten avoids Player.  If Kitten is cornered (no path to a wide-open area away from Player that avoids Player), Kitten will change strategy, approach and defeat 
Player.

Cat
Like Kitten, but also can also climb one-unit high walls.  Elevated cat thinks Player also can climb one-unit high walls.

*/