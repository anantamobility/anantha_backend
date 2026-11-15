export type UserContext = {
    id: string;
    name: string;
    role: string;
    status: string;
    permissions: string[];
};

export type PolicyCheck<T = any> = (user: UserContext, resource: T) => boolean;
export type ResourcePolicies = Record<string, PolicyCheck>;
