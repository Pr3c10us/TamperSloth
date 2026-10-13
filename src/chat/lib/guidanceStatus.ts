export function guidanceStatusLabel(result: {status?:string;alreadySatisfied?:boolean;observationPhase?:string;actionObserved?:boolean|null;idle?:boolean;checkInAllowed?:boolean} | undefined) {
    if(result?.status==='visualCheck') return result.actionObserved ? 'Click seen; checking screenshot' : 'Checking progress by screenshot';
    if(result?.status==='needsReview') {
        if(result.observationPhase==='navigated') return 'Step observed; page changed';
        if(result.observationPhase==='notStarted') return 'Could not watch this step';
        if(result.idle) return result.checkInAllowed ? 'No activity; checking in' : 'No activity yet; still watching';
        if(result.actionObserved===true) return 'Action detected; outcome unconfirmed';
        if(result.observationPhase==='timedOut' && result.actionObserved===false) return 'No action detected';
        return 'Action check interrupted';
    }
    if(result?.alreadySatisfied) return 'Step already complete';
    if(result?.status==='cancelled') return 'Guidance paused';
    return 'Step observed';
}
