import { createState, useState } from "@hookstate/core";
import { Persistence } from "@hookstate/persistence";
import { useMemo } from "react";

export const authState = createState({ accessToken: "", refreshToken: "" });
export const useAuth = () => {
    const auth = useState(authState);
    if (typeof window !== 'undefined') auth.attach(Persistence('auth'));
    return useMemo(() => ({
        ...auth.get(),
        isAuth: !!auth.accessToken.get(),
        setAccessToken: auth.accessToken.set,
        setRefreshToken: auth.refreshToken.set
    }), [auth]);
}

export default useAuth;