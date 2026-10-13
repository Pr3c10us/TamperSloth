export function guidanceStatusLabel(result: {status?:string;alreadySatisfied?:boolean;observationPhase?:string;actionObserved?:boolean|null} | undefined) {
    if(result?.status==='needsReview') {
        if(result.observationPhase==='notStarted') return 'Could not watch this step';
        if(result.actionObserved===true) return 'Action detected; outcome unconfirmed';
        if(result.observationPhase==='timedOut' && result.actionObserved===false) return 'No action detected';
        return 'Action check interrupted';
    }
    if(result?.alreadySatisfied) return 'Step already complete';
    if(result?.status==='cancelled') return 'Guidance paused';
    return 'Step observed';
}
