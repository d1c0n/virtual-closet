

// abstract class that represents a gesture
class Gesture {
    constructor(name, time_threshold=0.5, space_threshold=0.1) {
        this.name = name;
        this.time_threshold = time_threshold;
        this.space_threshold = space_threshold;
    }
    
    // abstract method "match gesture"
    matchGesture(sequence, timestamps, positions) {
        throw new Error("Abstract method!");
    }
}


// class that represents and matches a simple gesture based on the last n positions
class BaseGesture extends Gesture {
    constructor(name, time_threshold=0.5, space_threshold=0.1) {
        super(name, time_threshold, space_threshold);
    }

    matchGesture(sequence, timestamps, positions) {
        let matched_gesture = false;
        let has_found_gesture = false;
        let gesture, timestamp, pos, total_time, total_space;
        for (let idx = sequence.length - 1; idx >= 0; idx--) {
            gesture = sequence[idx];
            timestamp = timestamps[idx];
            pos = positions[idx];
            if (matched_gesture && (gesture == "None" || gesture == this.name)) {
                continue;
            }
            else if (matched_gesture) {
                return [true, sequence.slice(0, idx), timestamps.slice(0, idx), positions.slice(0, idx)];
            }
            if (gesture != this.name && gesture != "None") {
                return false;
            }
            else if (gesture == this.name || (gesture == "None" && has_found_gesture)) {
                has_found_gesture = true;
                total_time = (Date.now() - timestamp) / 1000;
                total_space = Math.sqrt((pos.x - positions[positions.length - 1].x) ** 2 + (pos.y - positions[positions.length - 1].y) ** 2);
                if (total_time > this.time_threshold && total_space < this.space_threshold) {
                    matched_gesture = true;
                }
                else if (total_space > this.space_threshold) {
                    return false;
                }
            }
            else if (gesture == "None") {
                continue;
            }
            else {
                return false;
            }
        }

        if (matched_gesture) {
            return [true, [], [], []];
        }
        return false;
    }
}


export class PeaceGesture extends BaseGesture {
    constructor(time_threshold=0.1, space_threshold=0.1) {
        super("Victory", time_threshold, space_threshold);
    }
    matchGesture(sequence, timestamps, positions) {
        return sequence[sequence.length - 1] == this.name ? true: false;
    }
}

export class PointingUpGesture extends BaseGesture {
    constructor(time_threshold=0.1, space_threshold=0.1) {
        super("Pointing_Up", time_threshold, space_threshold);
    }

    matchGesture(sequence, timestamps, positions) {
        return sequence[sequence.length - 1] == this.name ? true: false;
    }
}

export class ThubUp extends BaseGesture {
    constructor(time_threshold=0.1, space_threshold=0.1) {
        super("Thumb_Up", time_threshold, space_threshold);
    }
}


class OpenPalmGesture extends BaseGesture {
    constructor(time_threshold=0.1, space_threshold=0.1) {
        super("Open_Palm", time_threshold, space_threshold);
    }
}




class ClosedFistGesture extends BaseGesture {
    constructor(time_threshold=0.1, space_threshold=0.1) {
        super("Closed_Fist", time_threshold, space_threshold);
    }
}



class SequenceGesture extends Gesture {
    constructor(name, sequence, time_threshold=0.5, space_threshold=0.1) {
        super(name, time_threshold, space_threshold);
        this.sequence = sequence;
    }

    matchGesture(sequence, timestamps, positions) {
        for (let idx = this.sequence.length - 1; idx >= 0; idx--) {
            let el = this.sequence[idx];
            let result = el.matchGesture(sequence, timestamps, positions);
            if (!result) {
                return false;
            }
            sequence = result[1];
            timestamps = result[2];
            positions = result[3];
        }
        return true;
    }
}


export class GrabGesture extends SequenceGesture {
    constructor(time_threshold=0.1, space_threshold=0.2) {
        super("grab", [new OpenPalmGesture(), new ClosedFistGesture(time_threshold, space_threshold)], time_threshold, space_threshold);
    }
}


export class ReleaseGesture extends SequenceGesture {
    constructor(time_threshold=0.1, space_threshold=0.2) {
        super("release", [new ClosedFistGesture(), new OpenPalmGesture()], time_threshold, space_threshold);
    }
}

