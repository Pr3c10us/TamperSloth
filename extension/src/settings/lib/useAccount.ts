import {useSyncExternalStore} from "react";
import {accountSnapshot, type AccountState, subscribeAccount} from "./account";

export function useAccount(): AccountState {
    return useSyncExternalStore(subscribeAccount, accountSnapshot);
}
