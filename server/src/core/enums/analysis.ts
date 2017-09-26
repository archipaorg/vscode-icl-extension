export enum NoMatchAtCursorBehaviour {
    //if char at cursor is not a match, stop
    Stop,
    //if char at cursor is not a match, looks for one char left
    LookLeft,
    //if char at cursor is not a match, looks for one char right
    LookRight,
    //if char at cursor is not a match, looks for one char both sides
    LookBoth
}
