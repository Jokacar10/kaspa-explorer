import moment from "moment";
import {useContext, useEffect, useRef, useState} from 'react';
import {Button, Col, Container, Dropdown, Form, Row, Spinner} from "react-bootstrap";
import {BiGhost} from "react-icons/bi";
import {useParams} from "react-router";
import {Link, useSearchParams} from "react-router-dom";
import Toggle from "react-toggle";
import usePrevious, {floatToStr, numberWithCommas} from "../helper";
import {
    getAddressBalance,
    getAddressName,
    getAddressTxCount,
    getAddressUtxos,
    getBlock,
    getBlockdagInfo,
    getTransactions,
    getTransactionsFromAddress
} from '../kaspa-api-client.js';
import BlueScoreContext from "./BlueScoreContext";
import CopyButton from "./CopyButton.js";
import NotAcceptedTooltip from "./NotAccepted.js";
import PriceContext from "./PriceContext.js";
import UtxoPagination from "./UtxoPagination.js";

import QRCodeStyling from "qr-code-styling";
import QrButton from "./QrButton";
import {ADDRESS_PREFIX, KASPA_UNIT} from "../explorer_constants";


const AddressInfoPage = () => {
    const {addr} = useParams();
    return <AddressInfo key={addr}/>
}

const AddressInfo = () => {
    const {addr} = useParams();
    const ref = useRef(null);

    const [addressBalance, setAddressBalance] = useState()
    const {blueScore} = useContext(BlueScoreContext);
    const [search, setSearch] = useSearchParams();

    const [view, setView] = useState("transactions")
    const [showQr, setShowQr] = useState(false);

    const [addressName, setAddressName] = useState("");

    const [detailedView, setDetailedView] = useState(localStorage.getItem('detailedView') == "true")

    const [utxos, setUtxos] = useState([])
    const [loadingUtxos, setLoadingUtxos] = useState(true)

    const [txs, setTxs] = useState([])
    const [txsInpCache, setTxsInpCache] = useState([])
    const [loadingTxs, setLoadingTxs] = useState(true)
    const [txCount, setTxCount] = useState(null);
    const [txCountLimitExceeded, setTxCountLimitExceeded] = useState(null);
    const [pageError, setPageError] = useState(false);

    const [errorLoadingUtxos, setErrorLoadingUtxos] = useState(false)
    const [active, setActive] = useState(1)
    const [activeTx, setActiveTx] = useState((search.get('page') && parseInt(search.get('page'))) || 1)
    const prevActiveTx = usePrevious(activeTx)

    const [currentEpochTime, setCurrentEpochTime] = useState(0);
    const [currentDaaScore, setCurrentDaaScore] = useState(0);

    const {price} = useContext(PriceContext);

    const goToPage = (e) => {
        try {
            const pageNo = e.target.pageNo.value && parseInt(e.target.pageNo.value)

            if (!!pageNo && pageNo >= 1 && pageNo <= Math.ceil(txCount / 20)) {
                setActiveTx(pageNo)
                setPageError(false)
            } else {
                setPageError(true)
            }

        } catch {
            setPageError(true)
        }

        e.preventDefault()
    }

    const getAddrFromOutputs = (outputs, i) => {
        for (const o of outputs) {
            if (o.index == i) {
                return o.script_public_key_address
            }
        }
    }
    const getAmountFromOutputs = (outputs, i) => {
        for (const o of outputs) {
            if (o.index == i) {
                return o.amount / 100000000
            }
        }
    }

    const getAmount = (outputs, inputs) => {
        var balance = 0
        for (const o of (outputs || [])) {
            if (o.script_public_key_address == addr) {
                balance = balance + o.amount / 100000000
            }
        }
        for (const i of (inputs || [])) {
            if (getAddrFromOutputs(txsInpCache[i.previous_outpoint_hash]?.outputs || [], i.previous_outpoint_index) == addr) {
                balance = balance - getAmountFromOutputs(txsInpCache[i.previous_outpoint_hash]["outputs"], i.previous_outpoint_index)
            }
        }
        return balance
    }

    useEffect(() => {

        const qrCode = new QRCodeStyling({
            data: addr.replace(":", "\:"),
            width: 200,
            height: 200,
            type: "svg",
            image: "../kaspa-icon.png",
            dotsOptions: {
                color: "#181D30",
                type: "extra-rounded",
                gradient: {
                    type: "linear",
                    colorStops: [{offset: 0, color: "#134a40"}, {offset: 1, color: "#134a40"}]
                }
            },
            imageOptions: {
                crossOrigin: "anonymous",
                margin: 0,
                //   imageSize: 1
            },
            backgroundOptions: {
                color: "#ffffff"
            },
            cornersSquareOptions: {
                color: "#134a40"
            },
            qrOptions: {
                typeNumber: 0
            }
        });

        qrCode.append(ref.current);

        getAddressBalance(addr).then(
            (res) => {
                setAddressBalance(res)
            }
        )

        getAddressName(addr).then(
            (res) => {
                if (res.name) {
                    setAddressName(res.name)
                }
            }
        )

        getBlockdagInfo().then(
            (blockdag) => {
                getBlock(blockdag.tipHashes[0]).then(
                    (block) => {
                        setCurrentEpochTime(Math.round(parseInt(block.header.timestamp) / 1000))
                        setCurrentDaaScore(parseInt(block.header.daaScore))
                    }
                )
            }
        )

    }, [])

    useEffect(() => {
        localStorage.setItem("detailedView", detailedView)
    }, [detailedView])

    useEffect(() => {
        setErrorLoadingUtxos(false);
        // setLoadingUtxos(true);
    }, [addressBalance])

    const handleViewSwitch = (dontknow, e) => {
        const newValue = e.target.textContent

        if (newValue === "UTXOs") {
            setView("utxos")
        }
        if (newValue === "Transactions History") {
            setView("transactions")
        }
    }

    useEffect(() => {
        setSearch({"page": activeTx})
        setLoadingTxs(true)
        window.scrollTo(0, 0);
        if (prevActiveTx !== undefined)
            loadTransactionsToShow(addr, 20, (activeTx - 1) * 20);
    }, [activeTx])

    function removeDuplicates(arr) {
        return arr.filter((item,
                           index) => arr.indexOf(item) === index);
    }

    const loadTransactionsToShow = (addr, limit, offset) => {
        setLoadingTxs(true);
        getTransactionsFromAddress(addr, limit, offset).then(res => {
            setTxs(res);
            if (res.length === 0) {
                // page was too high. Set page 1
                setActiveTx(1);
                setLoadingTxs(false);
                return
            }
            setLoadingTxs(false);

            getTransactions(removeDuplicates(res.map(item => item.inputs)
                .flatMap(x => x)
                .map(x => x.previous_outpoint_hash))).then(
                txs => {
                    var txInpObj = {}
                    txs.forEach(x => txInpObj[x.transaction_id] = x)
                    setTxsInpCache(txInpObj)
                })
        })
            .catch(ex => {
                setLoadingTxs(false);
            })
    }

    useEffect(() => {

        if (view === "transactions") {
            loadTransactionsToShow(addr, 20, (activeTx - 1) * 20)
            getAddressTxCount(addr).then((addressTxCount) => {
                setTxCount(addressTxCount.total)
                setTxCountLimitExceeded(addressTxCount.limit_exceeded)
            })
            getAddressUtxos(addr).then(
                (res) => {
                    setLoadingUtxos(false);
                    setUtxos(res);
                }
            )
        }
        if (view === "utxos") {

        }
    }, [view])


    //     <div className="blockinfo-content">
    //     <div className="blockinfo-header"><h3>Details for {addr}</h3></div>
    //     <table className="blockinfo-table">
    //         <tr className="trow">
    //             <td>Balance</td>
    //             <td>{addressBalance/100000000} KAS</td>
    //         </tr>
    //         <tr>
    //             <td>UTXOs</td>
    //             <td>{utxos ? <ul>
    //                 {utxos
    //                 .sort((a,b) => {return b.utxoEntry.blockDaaScore - a.utxoEntry.blockDaaScore})
    //                 .map(x => <li>{x.utxoEntry.amount/100000000} KAS ({x.outpoint.transactionId})</li>)}
    //             </ul> : <>Loading UTXOs <Spinner animation="border" role="status" /></>}</td>
    //         </tr>
    //     </table>
    // </div> : <>Loading Address info <Spinner animation="border" role="status" /></>}

    return <div className="addressinfo-page">
        <Container className="webpage addressinfo-box" fluid>
            <Row>
                <Col xs={12}>
                    <div className="addressinfo-title d-flex flex-row align-items-end">address Overview
                    </div>

                </Col>
            </Row>
            <Row>
                <Col md={12} className="mt-sm-4">

                    <div className="addressinfo-header">Address{addressName ?
                        <span className="address-name">{addressName ? addressName : ""}</span> : ""}</div>
                    <div className="utxo-value-mono"><span
                        class="addressinfo-color">{ADDRESS_PREFIX}</span>{addr.substring(6, addr.length - 8)}<span
                        class="addressinfo-color">{addr.substring(addr.length - 8)}</span>
                        <CopyButton size="2rem" text={addr}/>
                        <QrButton addr="{addr}" onClick={() => setShowQr(!showQr)}/>

                        <div className="qr-code" ref={ref} hidden={!showQr}/>
                    </div>
                </Col>

            </Row>
            <Row>
                <Col sm={6} md={4}>
                    <div className="addressinfo-header mt-4">balance</div>
                    <div className="utxo-value d-flex">
                        {addressBalance !== undefined ?
                            <div className="utxo-amount">+{numberWithCommas(addressBalance / 100000000)} {KASPA_UNIT}</div> :
                            <Spinner animation="border" variant="primary"/>}</div>
                </Col>
                <Col sm={6} md={4}>
                    <div className="addressinfo-header mt-4 ms-sm-5">UTXOs count</div>
                    <div className="utxo-value ms-sm-5">{!loadingUtxos ? utxos.length :
                        <Spinner animation="border" variant="primary"/>}{errorLoadingUtxos &&
                        <BiGhost className="error-icon"/>}</div>
                </Col>
            </Row>
            <Row>
                <Col sm={6} md={4}>
                    <div className="addressinfo-header addressinfo-header-border mt-4 mt-sm-4 pt-sm-4 me-sm-5">value
                    </div>
                    <div
                        className="utxo-value">{numberWithCommas((addressBalance / 100000000 * price).toFixed(2))} USD
                    </div>
                </Col>
                <Col sm={6} md={4}>
                    <div
                        className="addressinfo-header addressinfo-header-border mt-4 mt-sm-4 pt-sm-4 ms-sm-5">Transactions
                        count
                    </div>
                    <div className="utxo-value ms-sm-5">
                        {txCount !== null ? (
                            <>
                                {txCountLimitExceeded && '>'}
                                {numberWithCommas(txCount)}
                            </>
                        ) : (
                            <Spinner animation="border" variant="primary"/>
                        )}
                        {errorLoadingUtxos && <BiGhost className="error-icon"/>}
                    </div>
                </Col>
            </Row>
        </Container>

        <Container className="webpage mt-4" fluid>
            <Row>
                <Col className="mt- d-flex flex-row">
                    <Dropdown className="d-inline mx-2" onSelect={handleViewSwitch}>
                        <Dropdown.Toggle id="dropdown-autoclose-true" variant="dark">
                            Change View
                        </Dropdown.Toggle>

                        <Dropdown.Menu>
                            <Dropdown.Item href="#">Transactions History</Dropdown.Item>
                            <Dropdown.Item href="#">UTXOs</Dropdown.Item>
                        </Dropdown.Menu>
                    </Dropdown>

                </Col>
            </Row>
        </Container>

        {view === "transactions" && <Container className="webpage addressinfo-box mt-4" fluid>
            <Row className="border-bottom border-bottom-1">
                <Col xs={6} className="d-flex flex-row align-items-center">
                    <div className="utxo-title d-flex flex-row">Transactions History</div>
                    <div className="ms-auto d-flex flex-row align-items-center"><Toggle
                        defaultChecked={localStorage.getItem('detailedView') === "true"}
                        size={"1px"}
                        icons={false}
                        onChange={(e) => {
                            setDetailedView(e.target.checked)
                        }}/><span className="text-light ms-2">Show details</span></div>
                </Col>
                <Col xs={12} md={6} className="d-flex flex-row justify-content-end ms-auto">
                    {txCount !== null ?
                        <UtxoPagination active={activeTx} total={Math.ceil(txCount / 20)} setActive={setActiveTx}/> :
                        <Spinner className="m-3" animation="border" variant="primary"/>}

                </Col>
            </Row>
            {txCount === 0 && <Row className="utxo-value mt-3"><Col xs={12}>No transactions to show.</Col></Row>}
            {!loadingTxs ? <>{txs.map((x) =>
                <>
                    <Row className="utxo-value text-primary mt-3">
                        <Col sm={7} md={7}>
                            {moment(x.block_time).format("YYYY-MM-DD HH:mm:ss")}
                        </Col>
                    </Row>
                    <Row className="pb-4 mb-0">
                        <Col sm={12} md={7}>
                            <div className="utxo-header mt-3">transaction id</div>
                            <div className="utxo-value-mono">
                                <Link className="blockinfo-link" to={`/txs/${x.transaction_id}`}>
                                    {x.transaction_id}
                                </Link>
                            </div>
                        </Col>
                        <Col sm={6} md={3}>
                            <div className="utxo-header mt-3">amount</div>
                            <div className="utxo-value">
                                <Link className="blockinfo-link" to={`/txs/${x.transaction_id}`}>
                                    {getAmount(x.outputs, x.inputs) > 0 ?
                                        <span
                                            className="utxo-amount">+{numberWithCommas(floatToStr(getAmount(x.outputs, x.inputs)))}&nbsp;{KASPA_UNIT}</span> :
                                        <span
                                            className="utxo-amount-minus">{numberWithCommas(floatToStr(getAmount(x.outputs, x.inputs)))}&nbsp;{KASPA_UNIT}</span>}
                                </Link>
                            </div>
                        </Col>
                        <Col sm={6} md={2}>
                            <div className="utxo-header mt-3">value</div>
                            <div
                                className="utxo-value">{numberWithCommas((getAmount(x.outputs, x.inputs) * price).toFixed(2))} $
                            </div>
                        </Col>
                    </Row>
                    {!!detailedView &&
                        <Row className="utxo-border pb-4 mb-4">
                            <Col sm={12} md={6}>
                                <div className="utxo-header mt-1">FROM</div>
                                <div className="utxo-value-mono" style={{fontSize: "smaller"}}>
                                    {x.inputs?.length > 0 ? x.inputs.map(x => {
                                        return (txsInpCache && txsInpCache[x.previous_outpoint_hash]) ? <>
                                                <Row id={`N${x.previous_outpoint_hash}${x.previous_outpoint_index}`}>
                                                    <Col xs={7} className="adressinfo-tx-overflow pb-0">
                                                        <Link className="blockinfo-link"
                                                              to={`/addresses/${getAddrFromOutputs(txsInpCache[x.previous_outpoint_hash]["outputs"], x.previous_outpoint_index)}`}>
                                                            <span
                                                                className={getAddrFromOutputs(txsInpCache[x.previous_outpoint_hash]["outputs"], x.previous_outpoint_index) == addr ? "highlight-addr" : ""}>{getAddrFromOutputs(txsInpCache[x.previous_outpoint_hash]["outputs"], x.previous_outpoint_index)}</span>
                                                        </Link>
                                                    </Col>
                                                    <Col xs={5}><span
                                                        className="block-utxo-amount-minus">-{numberWithCommas(getAmountFromOutputs(txsInpCache[x.previous_outpoint_hash]["outputs"], x.previous_outpoint_index))}&nbsp;{KASPA_UNIT}</span></Col></Row></> :
                                            <li key={`${x.previous_outpoint_hash}${x.previous_outpoint_index}`}>{x.previous_outpoint_hash} #{x.previous_outpoint_index}</li>
                                    }) : "COINBASE (New coins)"}

                                </div>
                            </Col>
                            <Col sm={12} md={6}>
                                <div className="utxo-header mt-1">TO</div>
                                <div className="utxo-value-mono" style={{fontSize: "smaller"}}>
                                    {x.outputs.map(x => <Row>
                                        <Col xs={7} className="pb-1 adressinfo-tx-overflow">
                                            <Link className="blockinfo-link"
                                                  to={`/addresses/${x.script_public_key_address}`}>
                                                <span
                                                    className={x.script_public_key_address == addr ? "highlight-addr" : ""}>
                                                    {x.script_public_key_address}
                                                </span>
                                            </Link>
                                        </Col>
                                        <Col xs={5}><span
                                            className="block-utxo-amount">+{numberWithCommas(x.amount / 100000000)}&nbsp;{KASPA_UNIT}</span></Col></Row>)}
                                </div>
                            </Col>
                            <Col md={12}>
                                <div className="utxo-header">Details</div>
                                <div className="utxo-value mt-2 d-flex flex-row flex-wrap"
                                     style={{marginBottom: "-1rem", textDecoration: "none"}}>
                                    {x.is_accepted ? (
                                    <div className="accepted-true me-3 mb-3">accepted</div>
                                    ) : (
                                    <>
                                        <span className="accepted-false">not accepted</span>
                                        <NotAcceptedTooltip />
                                    </>
                                    )}
                                    {x.is_accepted && blueScore !== 0 && (blueScore - x.accepting_block_blue_score) < 86400 &&
                                        <div
                                            className="confirmations mb-3">{blueScore - x.accepting_block_blue_score}&nbsp;confirmations</div>}
                                    {x.is_accepted && blueScore !== 0 && (blueScore - x.accepting_block_blue_score) >= 86400 &&
                                        <div className="confirmations mb-3">confirmed</div>}
                                </div>
                            </Col>

                        </Row>}

                </>
            )}
                <Row><Col xs={12} sm={6} className="d-flex flex-row justify-content-center mb-3 mb-sm-0">
                    <div className="me-auto" style={{height: "2.4rem"}}>
                        <Form onSubmit={goToPage} className="d-flex flex-row">
                            <Form.Control
                                type="text"
                                placeholder="Page"
                                name="pageNo"
                                style={{
                                    width: "4rem",
                                    border: `${pageError ? "5px solid red" : ""}`
                                }}
                            />
                            <Button type="submit" className="ms-2 me-auto">Go</Button>
                        </Form>
                    </div>
                </Col>
                    <Col xs={12} sm={6} className="d-flex flex-row justify-content-end">
                        <UtxoPagination className="ms-auto" active={activeTx} total={Math.ceil(txCount / 20)}
                                        setActive={setActiveTx}/>
                        {/* </> : <Spinner className="m-3" animation="border" variant="primary" />} */}

                    </Col></Row>
                // </> : <Spinner className="m-3" animation="border" variant="primary"/>}

        </Container>}
        {view === "utxos" &&
            <Container className="webpage addressinfo-box mt-4" fluid>
                <Row className="border-bottom border-bottom-1">
                    <Col xs={1}>
                        <div className="utxo-title d-flex flex-row">UTXOs</div>
                    </Col>
                    {utxos.length > 10 ? <Col xs={12} sm={11} className="d-flex flex-row justify-items-end">
                        <UtxoPagination active={active} total={Math.ceil(utxos.length / 10)} setActive={setActive}/>
                    </Col> : <></>}
                </Row>
                {errorLoadingUtxos && <BiGhost className="error-icon"/>}
                {!loadingUtxos ? utxos.sort((a, b) => b.utxoEntry.blockDaaScore - a.utxoEntry.blockDaaScore).slice((active - 1) * 10, (active - 1) * 10 + 10).map((x) => <>
                    <Row className="utxo-value text-primary mt-3">
                        <Col sm={7} md={7}>
                            {moment(((currentEpochTime) - (currentDaaScore - x.utxoEntry.blockDaaScore)) * 1000).format("YYYY-MM-DD HH:mm:ss")}
                        </Col>
                    </Row>
                    <Row className="utxo-border pb-4 mb-4">
                        <Col sm={6} md={4}>
                            <div className="utxo-header mt-3">transaction id</div>
                            <div className="utxo-value">
                                <Link className="blockinfo-link" to={`/txs/${x.outpoint.transactionId}`}>
                                    {x.outpoint.transactionId}
                                </Link>

                            </div>
                        </Col>
                        <Col sm={6} md={4}>
                            <div className="utxo-header mt-3">amount</div>
                            <div className="utxo-value d-flex flex-row">
                                <div className="utxo-amount">+{numberWithCommas(x.utxoEntry.amount / 100000000)} {KASPA_UNIT}
                                </div>
                            </div>
                        </Col>
                        <Col sm={6} md={4}>
                            <div className="utxo-header mt-3">value</div>
                            <div
                                className="utxo-value">{numberWithCommas((x.utxoEntry.amount / 100000000 * price).toFixed(2))} $
                            </div>
                        </Col>
                        <Col sm={6} md={4}>
                            <div className="utxo-header mt-3">index</div>
                            <div className="utxo-value">{x.outpoint.index}</div>
                        </Col>
                        <Col sm={6} md={4}>
                            <div className="utxo-header mt-3">Block DAA Score</div>
                            <div className="utxo-value">{x.utxoEntry.blockDaaScore}</div>
                        </Col>
                        <Col sm={6} md={4}>
                            <div className="utxo-header mt-3">details</div>
                            <div className="utxo-value">Unspent</div>
                        </Col>
                    </Row></>
                ) : <Spinner animation="border" variant="primary"/>}

            </Container>}

    </div>

}

export default AddressInfoPage;
