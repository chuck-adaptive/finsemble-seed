import React from "react";

export default class SymphonyShareMsgText extends React.Component {
	constructor(props) {
		super(props);
	}

	render() {
		return (
			<div>
				 <textarea id="shareText" value={this.props.shareMsg} readOnly></textarea>
			</div>
		);
	}
}
