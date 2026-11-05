

interface TrustedTypePolicyOptions {
    createHTML?: (input: string) => string;
    createScript?: (input: string) => string;
    createScriptURL?: (input: string) => string;
}

interface TrustedTypePolicy {
    createHTML(input: string): TrustedHTML;
    createScript(input: string): TrustedScript;
    createScriptURL(input: string): TrustedScriptURL;
}

interface TrustedTypePolicyFactory {
    createPolicy(name: string, options: TrustedTypePolicyOptions): TrustedTypePolicy;
}

interface Window {
    trustedTypes?: TrustedTypePolicyFactory;
}

declare var trustedTypes: TrustedTypePolicyFactory | undefined;