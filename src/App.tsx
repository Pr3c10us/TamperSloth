import {Link} from "react-router-dom";

function App() {
    return (
        <>
            <Link to={`/settings`}> Settings </Link>
            <Link to={`/chat`}> Chat </Link>
        </>
    )
}

export default App
