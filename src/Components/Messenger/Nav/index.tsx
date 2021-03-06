import { useState } from '@hookstate/core';

import { showListGroupState } from '@src/hooks/useListGroup';
import { showFriendsState } from '@src/hooks/useFriends';
import useAuth from '@src/hooks/useAuth';

import IconLeftArrow from '@src/styles/svg/left-arrow.svg';
import IconRightArrow from '@src/styles/svg/right-arrow.svg';
import IconFriends from '@src/styles/svg/friends.svg';
import styles from './nav.module.scss';
import useSocket from '@src/hooks/useSocket';
const Nav = () => {
    const socket = useSocket();
    const { setAccessToken, setRefreshToken} = useAuth();
    const showListGroup = useState(showListGroupState);
    const showModalFriends = useState(showFriendsState);
    return (
        <div className={styles.nav}>
            <div className={styles.navBar}>
                <button onClick={() => showListGroup.set(!showListGroup.get())}>
                    {
                        showListGroup.get() ? (
                            <IconLeftArrow />
                        ) : (
                            <IconRightArrow />
                        )
                    }
                </button>
            </div>
            <div className={styles.logo}>
                CHAT TOGETHER
            </div>
            <div className={styles.multiFeature}>
                <button onClick={() => showModalFriends.set(!showModalFriends.get())}>
                    <IconFriends />
                </button>
                <button onClick={() => {
                    setAccessToken('');
                    setRefreshToken('');
                    socket.disconnect();
                }}>
                    Đăng xuất
                </button>
            </div>
        </div>
    )
}

export default Nav;