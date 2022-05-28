import Avatar from '@src/Components/Layout/Avatar';
import IconMore from '@src/styles/svg/more.svg';
import Link from 'next/link';
import styles from './list-group.module.scss';

const Group = () => {
	return (
		<div className={styles.group}>
			<Avatar
				src={`https://ui-avatars.com/api/?name=${String.fromCharCode(Math.floor(Math.random()*25 + 65))}&background=random`}
				alt="avatar"
			/>
			<div className={styles.infoGroup}>
				<div className={styles.title}><Link href={`/messages/u/1`}> Đây là tên Group </Link></div>
				<div className={styles.message}>Vũ Bá Hướng: Oke nhé nhé nhé nhé nhé nhé</div>
			</div>
			<div className={styles.moreInfo}>
				<p className={styles.time}> 1 giờ</p>
				<button> <IconMore width="16" viewBox="0 0 20 4" /> </button>
			</div>
		</div>
	)
}

export default Group;