import { NavLink, Outlet } from "react-router";

const App = () => {

  return (
      <div>
        <h1>Confect</h1>
        <nav>
          <ul>
            <li>
              <NavLink to="/" end>
                Effect Only Example
              </NavLink>
            </li>
            <li>
              <NavLink to="/effect-atom" end>
                Effect Atom integration Example
              </NavLink>
            </li>
          </ul>
        </nav>
        <Outlet />
      </div>
  );
};


export default App;
