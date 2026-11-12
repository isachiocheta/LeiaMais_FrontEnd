import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Brand } from './Brand.jsx';
import { ContentContainer } from './ContentContainer.jsx';
import { useAuth } from '../hooks/useAuth.js';

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const isMobile = useMediaQuery('(max-width: 1000px)');
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();

  async function signOut() {
    try {
      await auth.logout();
      navigate('/login', { replace: true });
    } catch (error) {
      if (error.status === 401) navigate('/login', { replace: true });
    }
  }

  useEffect(() => {
    setOpen(false);
  }, [location.key, isMobile]);

  function onKeyDown(event) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <header id="inicio" className="site-header" tabIndex={-1} onKeyDown={onKeyDown}>
      <ContentContainer className="header-inner">
        <Link className="brand-link" to="/" aria-label="Leia+, página inicial" onClick={() => setOpen(false)}><Brand /></Link>
        <Button
          ref={triggerRef}
          className="mobile-menu-button"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={isMobile && open}
          aria-controls="public-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          Menu <span aria-hidden="true">{open ? '×' : '☰'}</span>
        </Button>
        <nav id="public-navigation" className="site-nav" aria-label="Navegação principal" hidden={isMobile && !open}>
          <NavLink to="/" end onClick={() => setOpen(false)}>Início</NavLink>
          <NavLink to="/sobre" onClick={() => setOpen(false)}>Sobre o clube</NavLink>
          {auth.status === 'authenticated' && <>
            <NavLink to="/catalogo" onClick={() => setOpen(false)}>Catálogo</NavLink>
            <NavLink to="/ciclos" onClick={() => setOpen(false)}>Ciclos</NavLink>
            <NavLink to="/encontros" onClick={() => setOpen(false)}>Agenda</NavLink>
            <NavLink to="/minha-area" onClick={() => setOpen(false)}>Minha área</NavLink>
            <NavLink to="/meu-perfil" onClick={() => setOpen(false)}>Meu perfil</NavLink>
            <Button type="button" onClick={signOut}>Sair</Button>
          </>}
          {auth.status === 'unauthenticated' && <>
            <NavLink to="/login" onClick={() => setOpen(false)}>Entrar</NavLink>
            <NavLink to="/cadastro" onClick={() => setOpen(false)}>Cadastro</NavLink>
          </>}
          {auth.status === 'checking' && <span className="session-nav" role="status">{auth.action === 'logout' ? 'Saindo…' : 'Verificando sessão…'}</span>}
          {auth.status === 'temporary_error' && <Button type="button" onClick={() => auth.verifySession().catch(() => {})}>Verificar sessão</Button>}
        </nav>
        {auth.status !== 'authenticated' && <span className="header-caption"><span aria-hidden="true">✳</span> Histórias que aproximam</span>}
      </ContentContainer>
      <div className="checker" aria-hidden="true" />
    </header>
  );
}
